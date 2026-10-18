import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockConsume, mockRecordUse, mockWithTransaction, mockCreateMany, mockDisable, mockAudit } =
  vi.hoisted(() => ({
    mockConsume: vi.fn(),
    mockRecordUse: vi.fn(),
    mockWithTransaction: vi.fn(),
    mockCreateMany: vi.fn(),
    mockDisable: vi.fn(),
    mockAudit: vi.fn(),
  }));

vi.mock('../../db/repositories/invite-code.repository', () => ({
  inviteCodeRepository: {
    withTransaction: mockWithTransaction,
    consume: mockConsume,
    recordUse: mockRecordUse,
    createMany: mockCreateMany,
    disable: mockDisable,
    list: vi.fn(),
    findUses: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('./audit.service', () => ({ auditService: { log: mockAudit } }));

import {
  inviteCodeService,
  InviteCodeError,
  normalizeInviteCode,
  generateInviteCode,
} from './invite-code.service';

const TX = { marker: 'tx' };
const account = { id: 'u1', tenantId: 't1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX));
  mockConsume.mockResolvedValue({ id: 'code-1' });
  mockRecordUse.mockResolvedValue(undefined);
});

describe('normalizeInviteCode', () => {
  it('去空白并转大写，使输入大小写不敏感', () => {
    expect(normalizeInviteCode('  abcd-ef12 ')).toBe('ABCD-EF12');
  });

  it('非字符串 / 空串 → 空串', () => {
    expect(normalizeInviteCode(undefined)).toBe('');
    expect(normalizeInviteCode(null)).toBe('');
    expect(normalizeInviteCode('   ')).toBe('');
    expect(normalizeInviteCode(123)).toBe('');
  });
});

describe('generateInviteCode', () => {
  it('格式为 4 段 × 4 位，且不含易混字符', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateInviteCode();
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$/);
    }
  });

  it('多次生成互不相同', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(set.size).toBe(200);
  });
});

describe('inviteCodeService.createAccountWithInvite', () => {
  const ctx = { source: 'register' as const, actorIp: '203.0.113.7' };

  it.each([undefined, '', '   '])('缺码（%j）→ 400 INVITE_CODE_REQUIRED，不开事务、不建号', async (raw) => {
    const create = vi.fn();

    const err = await inviteCodeService
      .createAccountWithInvite(raw as any, ctx, create)
      .catch((e) => e);

    expect(err).toBeInstanceOf(InviteCodeError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVITE_CODE_REQUIRED');
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('错码 / 过期 / 用尽 / 禁用（consume 无返回行）→ 400 INVITE_CODE_INVALID，不建号', async () => {
    mockConsume.mockResolvedValue(null);
    const create = vi.fn();

    const err = await inviteCodeService
      .createAccountWithInvite('WXYZ-1234-ABCD', ctx, create)
      .catch((e) => e);

    expect(err).toBeInstanceOf(InviteCodeError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVITE_CODE_INVALID');
    expect(create).not.toHaveBeenCalled();
    expect(mockRecordUse).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('有效码：在同一个 tx 里 消费 → 建号 → 记录使用，然后写审计', async () => {
    const create = vi.fn().mockResolvedValue(account);

    const result = await inviteCodeService.createAccountWithInvite('abcd-1234-efgh', ctx, create);

    expect(result).toBe(account);
    // 归一化后再消费
    expect(mockConsume).toHaveBeenCalledWith('ABCD-1234-EFGH', TX);
    expect(create).toHaveBeenCalledWith(TX);
    expect(mockRecordUse).toHaveBeenCalledWith({ codeId: 'code-1', userId: 'u1' }, TX);
    // 先消费再建号
    expect(mockConsume.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(mockRecordUse.mock.invocationCallOrder[0]);
  });

  it('审计：谁、哪个码、何时（时间由审计表 created_at 记录）', async () => {
    await inviteCodeService.createAccountWithInvite(
      'abcd-1234-efgh',
      { source: 'oauth', provider: 'google', actorIp: '203.0.113.7' },
      vi.fn().mockResolvedValue(account),
    );

    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        actorId: 'u1',
        actorIp: '203.0.113.7',
        action: 'invite_code_use',
        targetType: 'invite_code',
        targetId: 'code-1',
        metadata: expect.objectContaining({
          code: 'ABCD-1234-EFGH',
          source: 'oauth',
          provider: 'google',
        }),
      }),
    );
  });

  it('审计在事务提交之后才写，回滚的注册不留审计', async () => {
    let auditedInsideTx = false;
    mockWithTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const r = await fn(TX);
      auditedInsideTx = mockAudit.mock.calls.length > 0;
      return r;
    });

    await inviteCodeService.createAccountWithInvite(
      'abcd-1234-efgh',
      ctx,
      vi.fn().mockResolvedValue(account),
    );

    expect(auditedInsideTx).toBe(false);
    expect(mockAudit).toHaveBeenCalledTimes(1);
  });

  it('建号失败 → 错误向外抛（事务回滚），不记录使用、不写审计', async () => {
    const boom = new Error('duplicate key value violates unique constraint');
    const create = vi.fn().mockRejectedValue(boom);

    await expect(
      inviteCodeService.createAccountWithInvite('abcd-1234-efgh', ctx, create),
    ).rejects.toBe(boom);

    expect(mockRecordUse).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

/**
 * 用一个会模拟「行锁 + 回滚」的内存假库，验证服务层的事务边界逻辑：
 *  - 事务串行（模拟 UPDATE 在行上等锁，后到的请求在前一个提交后按最新值重新判断）
 *  - 事务内的写入只在回调成功后才提交，抛错则整体丢弃
 *
 * 这只能证明「服务层把消费和建号放进了同一个事务、并依赖条件更新的返回行判断成败」，
 * 不能证明 PostgreSQL 的真实并发行为——后者必须在真实库上验证。
 */
describe('单次码并发注册（内存假库，模拟行锁与回滚）', () => {
  type Store = { usedCount: number; users: string[]; uses: string[] };

  function installFakeDb(maxUses: number) {
    const committed: Store = { usedCount: 0, users: [], uses: [] };
    let lock: Promise<unknown> = Promise.resolve();

    mockWithTransaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
      const run = lock.then(async () => {
        const draft: Store = { ...committed, users: [...committed.users], uses: [...committed.uses] };
        const tx = { draft };
        // fn 抛错时直接冒泡、不提交 draft，即回滚
        const r = await fn(tx);
        Object.assign(committed, draft);
        return r;
      });
      lock = run.catch(() => undefined);
      return run;
    });

    mockConsume.mockImplementation(async (_code: string, tx: any) => {
      if (tx.draft.usedCount < maxUses) {
        tx.draft.usedCount += 1;
        return { id: 'code-1' };
      }
      return null;
    });
    mockRecordUse.mockImplementation(async ({ userId }: { userId: string }, tx: any) => {
      tx.draft.uses.push(userId);
    });

    return committed;
  }

  it('同一个单次码两个并发注册：只成功一个，只留下一个用户', async () => {
    const committed = installFakeDb(1);
    const make = (id: string) => async (tx: any) => {
      await Promise.resolve(); // 让出调度，制造交错机会
      tx.draft.users.push(id);
      return { id, tenantId: 't' };
    };

    const results = await Promise.allSettled([
      inviteCodeService.createAccountWithInvite('abcd', { source: 'register' }, make('A')),
      inviteCodeService.createAccountWithInvite('abcd', { source: 'register' }, make('B')),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InviteCodeError);
    expect(rejected.reason.code).toBe('INVITE_CODE_INVALID');
    expect(committed.usedCount).toBe(1);
    expect(committed.users).toHaveLength(1);
    expect(committed.uses).toHaveLength(1);
  });

  it('建号抛错 → 回滚后 used_count 不变，码还能给下一个人用', async () => {
    const committed = installFakeDb(1);

    await expect(
      inviteCodeService.createAccountWithInvite('abcd', { source: 'register' }, async () => {
        throw new Error('insert user failed');
      }),
    ).rejects.toThrow('insert user failed');
    expect(committed.usedCount).toBe(0);

    await inviteCodeService.createAccountWithInvite('abcd', { source: 'register' }, async (tx: any) => {
      tx.draft.users.push('C');
      return { id: 'C', tenantId: 't' };
    });
    expect(committed.usedCount).toBe(1);
    expect(committed.users).toEqual(['C']);
  });
});

describe('inviteCodeService.generate', () => {
  beforeEach(() => {
    mockCreateMany.mockImplementation(async (rows: any[]) =>
      rows.map((r, i) => ({ id: `id-${i}`, usedCount: 0, disabled: false, ...r })),
    );
  });

  it('批量生成：数量、次数、过期时间、备注、生成者都落到每一行', async () => {
    const expiresAt = new Date('2030-01-01T00:00:00Z');
    const rows = await inviteCodeService.generate(
      { count: 3, maxUses: 5, expiresAt, note: 'beta' },
      { adminId: 'admin-1', tenantId: 'tenant-1' },
    );

    expect(rows).toHaveLength(3);
    const arg = mockCreateMany.mock.calls[0][0];
    expect(arg).toHaveLength(3);
    for (const r of arg) {
      expect(r).toMatchObject({ maxUses: 5, expiresAt, note: 'beta', createdBy: 'admin-1' });
      expect(r.code).toMatch(/^[A-Z0-9-]+$/);
    }
    expect(new Set(arg.map((r: any) => r.code)).size).toBe(3);
  });

  it('生成动作写审计', async () => {
    await inviteCodeService.generate(
      { count: 2, maxUses: 1 },
      { adminId: 'admin-1', tenantId: 'tenant-1' },
    );

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        action: 'invite_code_create',
        metadata: expect.objectContaining({ count: 2, maxUses: 1 }),
      }),
    );
  });
});

describe('inviteCodeService.disable', () => {
  it('停用并写审计', async () => {
    mockDisable.mockResolvedValue({ id: 'c1', code: 'AAAA' });

    await inviteCodeService.disable('c1', { adminId: 'admin-1', tenantId: 'tenant-1' });

    expect(mockDisable).toHaveBeenCalledWith('c1');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'invite_code_disable', targetId: 'c1' }),
    );
  });

  it('码不存在 → NotFound', async () => {
    mockDisable.mockResolvedValue(null);

    await expect(
      inviteCodeService.disable('nope', { adminId: 'a', tenantId: 't' }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockAudit).not.toHaveBeenCalled();
  });
});
