import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { InviteCodeRepository } from './invite-code.repository';

/**
 * 邀请码消费是并发正确性的核心：一个单次码被两个请求同时用，只能有一个成功。
 * 这里不连库，只验两件事：
 *   1. 消费确实是「单条条件 UPDATE ... RETURNING」，所有条件都在 WHERE 里，
 *      而不是先 SELECT 再 UPDATE（那样两个请求会同时读到 used_count=0）；
 *   2. 返回行数决定成败。
 * 真实并发行为取决于 PostgreSQL 的行锁，需要在真实库上验证。
 */

const dialect = new PgDialect();

function makeExecutor(returnRows: unknown[]) {
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

describe('InviteCodeRepository.consume', () => {
  it('把全部有效性条件放进同一条 UPDATE 的 WHERE', async () => {
    const { executor, captured } = makeExecutor([{ id: 'c1' }]);
    const repo = new InviteCodeRepository({} as any);

    await repo.consume('ABCD-EFGH', executor);

    const { sql: text, params } = dialect.sqlToQuery(captured.where);
    expect(text).toContain('"code" = $1');
    expect(params[0]).toBe('ABCD-EFGH');
    expect(text).toMatch(/"used_count" < "invite_codes"\."max_uses"|"used_count" < "max_uses"/);
    expect(text).toContain('"expires_at" is null');
    expect(text).toMatch(/"expires_at" > now\(\)/);
    expect(text).toContain('"disabled" = $');
    // disabled 必须是和 false 比较
    expect(params).toContain(false);
  });

  it('用量自增写成 used_count + 1 的 SQL 表达式，而不是读出来再写回', async () => {
    const { executor, captured } = makeExecutor([{ id: 'c1' }]);
    const repo = new InviteCodeRepository({} as any);

    await repo.consume('X', executor);

    const { sql: text } = dialect.sqlToQuery(captured.set.usedCount);
    expect(text).toMatch(/"used_count" \+ 1/);
  });

  it('有返回行 → 返回码 id', async () => {
    const { executor } = makeExecutor([{ id: 'c1' }]);
    const repo = new InviteCodeRepository({} as any);

    await expect(repo.consume('X', executor)).resolves.toEqual({ id: 'c1' });
  });

  it('无返回行（不存在 / 过期 / 用尽 / 禁用）→ null', async () => {
    const { executor } = makeExecutor([]);
    const repo = new InviteCodeRepository({} as any);

    await expect(repo.consume('X', executor)).resolves.toBeNull();
  });

  it('不传 executor 时用自己的连接', async () => {
    const { executor } = makeExecutor([{ id: 'c1' }]);
    const repo = new InviteCodeRepository(executor);

    await repo.consume('X');

    expect(executor.update).toHaveBeenCalledTimes(1);
  });
});

describe('InviteCodeRepository.withTransaction', () => {
  it('把回调交给 db.transaction，并透传返回值', async () => {
    const tx = { marker: 'tx' };
    const db: any = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    };
    const repo = new InviteCodeRepository(db);

    const result = await repo.withTransaction(async (t) => {
      expect(t).toBe(tx);
      return 42;
    });

    expect(result).toBe(42);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('回调抛错时错误原样向外抛（由 drizzle 负责回滚）', async () => {
    const db: any = {
      transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({})),
    };
    const repo = new InviteCodeRepository(db);

    await expect(
      repo.withTransaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
