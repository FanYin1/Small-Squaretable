import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { CreditRepository } from './credit.repository';

/**
 * 点数账本的并发正确性依赖几条单语句 SQL：
 *   - 租户级事务咨询锁（串行化「检查额度 + 写冻结」）
 *   - 余额与冻结在同一条语句里取（同一个快照）
 *   - 冻结状态翻转是条件 UPDATE ... RETURNING（重复结算 / 与清扫赛跑最多生效一次）
 *   - 清扫用 FOR UPDATE SKIP LOCKED
 * 这里不连库，只验这些语句的形状与结果解析；真实并发行为取决于 PostgreSQL，
 * 在真实库上验证（见 scripts 并发脚本与最终报告）。
 *
 * 另外断言「账本只追加」：repository 上没有任何更新 / 删除账本的方法。
 */

const dialect = new PgDialect();

function makeExecutor(rows: unknown[] = []) {
  const executed: unknown[] = [];
  const executor: any = {
    execute: vi.fn(async (statement: unknown) => {
      executed.push(statement);
      return rows;
    }),
  };
  return { executor, executed };
}

function makeUpdateExecutor(returnRows: unknown[]) {
  const captured: { set?: any; where?: any } = {};
  const builder: any = {
    set: (v: unknown) => {
      captured.set = v;
      return builder;
    },
    where: (w: unknown) => {
      captured.where = w;
      return builder;
    },
    returning: () => Promise.resolve(returnRows),
  };
  const executor: any = { update: vi.fn(() => builder) };
  return { executor, captured };
}

const repo = new CreditRepository({} as any);

describe('CreditRepository activity precision', () => {
  const range = { from: '2026-10-01T00:00:00Z', to: '2026-10-26T00:00:00Z' };
  it('binds timestamp strings with explicit types for the raw postgres driver', async () => {
    const { executor, executed } = makeExecutor([{ spent: '0', credited: '0', adjustment: '0', charges: 0, known: 0, input: null, output: null }]);
    await new CreditRepository(executor).getActivity('tenant-1', range);
    const query = dialect.sqlToQuery(executed[0] as any);
    expect(query.params).toEqual(['tenant-1', range.from, range.to]);
    expect(query.sql).toContain('created_at >= $2::timestamptz');
    expect(query.sql).toContain('created_at < $3::timestamptz');
  });
  it('rejects aggregate overflow instead of silently rounding recorded usage', async () => {
    const { executor } = makeExecutor([{ spent: '0', credited: '0', adjustment: '0', charges: 2, known: 2, input: '9007199254740992', output: '0' }]);
    await expect(new CreditRepository(executor).getActivity('tenant-1', range)).rejects.toThrow('outside the supported range');
  });
  it('keeps no recorded usage null while preserving real recorded zeros', async () => {
    for (const [input, expected] of [[null, null], ['0', 0]] as const) {
      const { executor } = makeExecutor([{ spent: '0', credited: '0', adjustment: '0', charges: 1, known: input === null ? 0 : 1, input, output: input }]);
      expect(await new CreditRepository(executor).getActivity('tenant-1', range)).toMatchObject({ inputTokens: expected, outputTokens: expected, unknownUsageCount: input === null ? 1 : 0 });
    }
  });
});

describe('CreditRepository.lockTenant', () => {
  it('takes a transaction-scoped advisory lock keyed by the tenant', async () => {
    const { executor, executed } = makeExecutor();

    await repo.lockTenant('tenant-1', executor);

    const { sql: text, params } = dialect.sqlToQuery(executed[0] as any);
    expect(text).toContain('pg_advisory_xact_lock');
    expect(text).toContain('hashtextextended');
    expect(params).toEqual(['credit:tenant-1']);
  });

  it('uses different keys for different tenants', async () => {
    const a = makeExecutor();
    const b = makeExecutor();

    await repo.lockTenant('tenant-a', a.executor);
    await repo.lockTenant('tenant-b', b.executor);

    expect(dialect.sqlToQuery(a.executed[0] as any).params).not.toEqual(
      dialect.sqlToQuery(b.executed[0] as any).params
    );
  });
});

describe('CreditRepository.getAvailability', () => {
  it('reads balance and active holds in one statement for one tenant', async () => {
    const { executor, executed } = makeExecutor([{ balance: '100000', held: '6000' }]);

    await repo.getAvailability('tenant-1', executor);

    expect(executed).toHaveLength(1);
    const { sql: text, params } = dialect.sqlToQuery(executed[0] as any);
    expect(text).toContain('SUM(amount) FROM credit_ledger');
    expect(text).toContain('SUM(tokens) FROM credit_reservations');
    expect(text).toContain("status = 'active'");
    expect(params).toEqual(['tenant-1', 'tenant-1', 'tenant-1']);
    expect(text).toContain("settings->>'creditUnlimitedUserId' = account.id::text");
    expect(text).toContain('other_account.id <> account.id');
    expect(text).toContain("metadata->'creditExempt' IS DISTINCT FROM 'true'::jsonb");
  });

  it('parses bigint strings and derives available = balance - held', async () => {
    const { executor } = makeExecutor([{ balance: '100000', held: '6000' }]);

    await expect(repo.getAvailability('tenant-1', executor)).resolves.toEqual({
      balance: 100000,
      held: 6000,
      available: 94000,
    });
  });

  it('reports a negative available figure as is (callers decide)', async () => {
    const { executor } = makeExecutor([{ balance: 1000, held: 4000 }]);

    expect((await repo.getAvailability('t', executor)).available).toBe(-3000);
  });

  it('only exposes an explicitly granted exemption without inventing a balance', async () => {
    const { executor } = makeExecutor([{ balance: '0', held: '0', unlimited: true }]);
    await expect(repo.getAvailability('tenant-1', executor)).resolves.toEqual({ balance: 0, held: 0, available: 0, unlimited: true });
  });

  it('treats a missing row as an empty account', async () => {
    const { executor } = makeExecutor([]);

    await expect(repo.getAvailability('t', executor)).resolves.toEqual({ balance: 0, held: 0, available: 0 });
  });
});

describe('CreditRepository.closeReservation', () => {
  it('settles exempt usage exactly once and stores actual usage without a charge', async () => {
    const { executor, captured } = makeUpdateExecutor([{ id: 'r1', status: 'settled' }]);
    await repo.closeExemptReservation('r1', { inputTokens: 1200, outputTokens: 300, messageId: 5 }, executor);
    expect(captured.set).toMatchObject({ status: 'settled', chargedTokens: 0 });
    expect(dialect.sqlToQuery(captured.set.metadata).params).toEqual([JSON.stringify({ inputTokens: 1200, outputTokens: 300, messageId: 5 })]);
    expect(dialect.sqlToQuery(captured.where).params).toEqual(['r1', 'active', 'expired']);
  });
  it('flips the status with a conditional UPDATE ... RETURNING', async () => {
    const { executor, captured } = makeUpdateExecutor([{ id: 'r1', status: 'settled' }]);

    const row = await repo.closeReservation('r1', ['active', 'expired'], 'settled', 620, executor);

    expect(row).toEqual({ id: 'r1', status: 'settled' });
    expect(captured.set).toMatchObject({ status: 'settled', chargedTokens: 620 });

    const { sql: text, params } = dialect.sqlToQuery(captured.where);
    expect(text).toContain('"id" = $1');
    expect(text).toContain('"status" in ($2, $3)');
    expect(params).toEqual(['r1', 'active', 'expired']);

    // closedAt 由数据库时钟写入
    expect(dialect.sqlToQuery(captured.set.closedAt).sql).toContain('now()');
  });

  it('returns null when the current status is not in the allowed set (already closed)', async () => {
    const { executor } = makeUpdateExecutor([]);

    await expect(repo.closeReservation('r1', ['active'], 'released', null, executor)).resolves.toBeNull();
  });

  it('stores a null charge for a release', async () => {
    const { executor, captured } = makeUpdateExecutor([{ id: 'r1' }]);

    await repo.closeReservation('r1', ['active'], 'released', null, executor);

    expect(captured.set.chargedTokens).toBeNull();
  });
});

describe('CreditRepository.expireDue', () => {
  it('sweeps due active holds with FOR UPDATE SKIP LOCKED, in bounded batches', async () => {
    const { executor, executed } = makeExecutor([{ id: 'a' }, { id: 'b' }]);

    const count = await repo.expireDue(200, executor);

    expect(count).toBe(2);
    const { sql: text, params } = dialect.sqlToQuery(executed[0] as any);
    expect(text).toContain("SET status = 'expired'");
    expect(text).toContain("status = 'active' AND expires_at <= now()");
    expect(text).toContain('FOR UPDATE SKIP LOCKED');
    expect(text).toContain('LIMIT $1');
    expect(params).toEqual([200]);
  });

  it('returns 0 when nothing is due', async () => {
    const { executor } = makeExecutor([]);

    await expect(repo.expireDue(10, executor)).resolves.toBe(0);
  });
});

describe('CreditRepository.insertReservation', () => {
  it('accepts a database-clock SQL expression as expiry', async () => {
    const values = vi.fn().mockReturnValue({ returning: () => Promise.resolve([{ id: 'r1' }]) });
    const executor: any = { insert: vi.fn(() => ({ values })) };
    const expiresAt = sql`now() + make_interval(secs => ${900})`;

    const row = await repo.insertReservation(
      { tenantId: 't', tokens: 6000, expiresAt } as any,
      executor
    );

    expect(row).toEqual({ id: 'r1' });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ expiresAt }));
  });
});

describe('CreditRepository.listOperatorEntries', () => {
  it('lists only top-ups and reversals, newest first, with the account emails', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'a', kind: 'topup' }])
      .mockResolvedValueOnce([{ count: 7 }]);
    const r = new CreditRepository({ execute } as any);

    const result = await r.listOperatorEntries({ page: 3, limit: 20 });

    expect(result).toEqual({ items: [{ id: 'a', kind: 'topup' }], total: 7 });
    const list = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(list.sql).toContain("l.kind IN ('topup', 'reversal')");
    expect(list.sql).toContain('ORDER BY l.created_at DESC');
    expect(list.sql).toContain('"tenantEmail"');
    expect(list.sql).toContain('"operatorEmail"');
    // page 3, limit 20 -> offset 40
    expect(list.params).toEqual([20, 40]);
    expect(dialect.sqlToQuery(execute.mock.calls[1][0]).sql).toContain("kind IN ('topup', 'reversal')");
  });
});

describe('append-only ledger', () => {
  it('exposes no method that updates or deletes ledger rows', () => {
    const methods = Object.getOwnPropertyNames(CreditRepository.prototype);
    const ledgerMutators = methods.filter((name) => /^(update|delete|remove|edit|set)/i.test(name));

    expect(ledgerMutators).toEqual([]);
    expect(methods).toContain('insertLedger');
  });
});
