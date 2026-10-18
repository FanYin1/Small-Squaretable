/**
 * 运营者充值 / 冲正 / 查询（P3-1）
 *
 * repository 与 audit 全部替换，这里验证 service 的规则：
 * 金额换算与上限、幂等键语义、冲正的各种拒绝条件、锁内检查顺序、审计内容。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { repo, userRepo, audit } = vi.hoisted(() => ({
  repo: {
    withTransaction: vi.fn(),
    lockTenant: vi.fn(),
    findLedgerByIdempotencyKey: vi.fn(),
    findLedgerById: vi.fn(),
    findReversalOf: vi.fn(),
    insertLedger: vi.fn(),
    getAvailability: vi.fn(),
    listLedger: vi.fn(),
    listOperatorEntries: vi.fn(),
  },
  userRepo: { findById: vi.fn(), findByEmail: vi.fn() },
  audit: { log: vi.fn() },
}));

vi.mock('../../db/repositories/credit.repository', () => ({ creditRepository: repo }));
vi.mock('../../db/repositories/user.repository', () => ({ userRepository: userRepo }));
vi.mock('./audit.service', () => ({ auditService: audit }));
vi.mock('../../core/config', () => ({
  config: { creditTokensPerPoint: 10000 },
}));

import { creditService, CreditConflictError, MAX_TOPUP_POINTS } from './credit.service';

const ACTOR = { adminId: 'admin-1', tenantId: 'admin-tenant', actorIp: '10.0.0.1' };
const USER = { id: 'user-1', email: 'u@example.com', tenantId: 'tenant-1' };

function topupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ledger-1',
    tenantId: USER.tenantId,
    kind: 'topup',
    amount: 100000,
    idempotencyKey: 'key-1',
    operatorId: ACTOR.adminId,
    ...overrides,
  };
}

describe('creditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 事务直接执行回调，tx 用一个标记对象
    repo.withTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ tx: true }));
    repo.lockTenant.mockResolvedValue(undefined);
    repo.findLedgerByIdempotencyKey.mockResolvedValue(null);
    repo.findReversalOf.mockResolvedValue(null);
    repo.getAvailability.mockResolvedValue({ balance: 100000, held: 0, available: 100000 });
    repo.insertLedger.mockImplementation(async (data: Record<string, unknown>) => ({ id: 'new-entry', ...data }));
    userRepo.findById.mockResolvedValue(USER);
    userRepo.findByEmail.mockResolvedValue(USER);
  });

  describe('getSummary / lookupUser', () => {
    it('converts tokens to points and never reports negative available points', async () => {
      repo.getAvailability.mockResolvedValue({ balance: 6200, held: 9000, available: -2800 });

      const summary = await creditService.getSummary('tenant-1');

      expect(summary).toEqual({
        tokensPerPoint: 10000,
        balanceTokens: 6200,
        heldTokens: 9000,
        availableTokens: -2800,
        balancePoints: 0.62,
        availablePoints: 0,
      });
    });

    it('looks a user up by email (case-insensitive) with the tenant summary', async () => {
      const result = await creditService.lookupUser({ email: '  U@Example.com ' });

      expect(userRepo.findByEmail).toHaveBeenCalledWith('u@example.com');
      expect(result.user).toEqual({ id: 'user-1', email: 'u@example.com', tenantId: 'tenant-1' });
      expect(result.summary.balanceTokens).toBe(100000);
    });

    it('throws NOT_FOUND for an unknown user', async () => {
      userRepo.findById.mockResolvedValue(null);

      await expect(creditService.lookupUser({ userId: 'nope' })).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    it('throws NOT_FOUND when neither id nor email is given', async () => {
      await expect(creditService.lookupUser({})).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('topUp', () => {
    const input = { userId: 'user-1', points: 10, note: 'manual', idempotencyKey: 'key-1' };

    it('writes one topup row in integer tokens under the tenant lock', async () => {
      const result = await creditService.topUp(input, ACTOR);

      expect(repo.lockTenant).toHaveBeenCalledWith('tenant-1', expect.anything());
      expect(repo.insertLedger).toHaveBeenCalledTimes(1);
      expect(repo.insertLedger).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          kind: 'topup',
          amount: 100000,
          idempotencyKey: 'key-1',
          operatorId: 'admin-1',
          note: 'manual',
        }),
        expect.anything()
      );
      expect(repo.lockTenant.mock.invocationCallOrder[0]).toBeLessThan(
        repo.findLedgerByIdempotencyKey.mock.invocationCallOrder[0]
      );
      expect(result.replayed).toBe(false);
      expect(result.summary.balancePoints).toBe(10);
    });

    it('writes an audit log with who / how much / for whom, using the admin tenant', async () => {
      await creditService.topUp(input, ACTOR);

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'admin-tenant',
          actorId: 'admin-1',
          actorIp: '10.0.0.1',
          action: 'credit_topup',
          targetType: 'credit_ledger',
          targetId: 'new-entry',
          metadata: expect.objectContaining({
            targetUserId: 'user-1',
            targetTenantId: 'tenant-1',
            tokens: 100000,
            points: 10,
            note: 'manual',
          }),
        })
      );
    });

    it('returns the first result for a repeated key with identical content, without a second row or audit', async () => {
      repo.findLedgerByIdempotencyKey.mockResolvedValue(topupRow());

      const result = await creditService.topUp(input, ACTOR);

      expect(result.replayed).toBe(true);
      expect(result.entry.id).toBe('ledger-1');
      expect(repo.insertLedger).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it.each([
      ['another tenant', { tenantId: 'tenant-2' }],
      ['another amount', { amount: 5 }],
      ['another kind', { kind: 'reversal' }],
    ])('rejects a reused key with %s as IDEMPOTENCY_CONFLICT', async (_label, override) => {
      repo.findLedgerByIdempotencyKey.mockResolvedValue(topupRow(override));

      await expect(creditService.topUp(input, ACTOR)).rejects.toMatchObject({
        statusCode: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      });
      expect(repo.insertLedger).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it.each([0, -5, Number.NaN, 0.00001])('rejects an invalid amount (%s) before touching the DB', async (points) => {
      await expect(creditService.topUp({ ...input, points }, ACTOR)).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
      expect(repo.withTransaction).not.toHaveBeenCalled();
    });

    it('rejects amounts above the per-top-up cap', async () => {
      await expect(
        creditService.topUp({ ...input, points: MAX_TOPUP_POINTS + 1 }, ACTOR)
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(repo.withTransaction).not.toHaveBeenCalled();
    });

    it('accepts exactly the cap', async () => {
      await creditService.topUp({ ...input, points: MAX_TOPUP_POINTS }, ACTOR);

      expect(repo.insertLedger).toHaveBeenCalledWith(
        expect.objectContaining({ amount: MAX_TOPUP_POINTS * 10000 }),
        expect.anything()
      );
    });

    it('does not write anything when the target user does not exist', async () => {
      userRepo.findById.mockResolvedValue(null);

      await expect(creditService.topUp(input, ACTOR)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(repo.withTransaction).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('does not audit when the transaction fails', async () => {
      repo.insertLedger.mockRejectedValue(new Error('db down'));

      await expect(creditService.topUp(input, ACTOR)).rejects.toThrow('db down');
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('reverse', () => {
    beforeEach(() => {
      repo.findLedgerById.mockResolvedValue(topupRow());
    });

    it('writes a negative reversal row linked to the top-up and audits it', async () => {
      repo.getAvailability
        .mockResolvedValueOnce({ balance: 100000, held: 0, available: 100000 })
        .mockResolvedValueOnce({ balance: 0, held: 0, available: 0 });

      const result = await creditService.reverse('ledger-1', { note: 'typo' }, ACTOR);

      expect(repo.lockTenant).toHaveBeenCalledWith('tenant-1', expect.anything());
      expect(repo.insertLedger).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          kind: 'reversal',
          amount: -100000,
          reversesId: 'ledger-1',
          operatorId: 'admin-1',
          note: 'typo',
        }),
        expect.anything()
      );
      expect(result.summary.balanceTokens).toBe(0);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'admin-tenant',
          actorId: 'admin-1',
          action: 'credit_reversal',
          targetType: 'credit_ledger',
          metadata: expect.objectContaining({ reversesId: 'ledger-1', targetTenantId: 'tenant-1', tokens: 100000 }),
        })
      );
    });

    it('404 when the entry does not exist', async () => {
      repo.findLedgerById.mockResolvedValue(null);

      await expect(creditService.reverse('missing', {}, ACTOR)).rejects.toMatchObject({ statusCode: 404 });
      expect(repo.insertLedger).not.toHaveBeenCalled();
    });

    it.each(['charge', 'reversal'])('only top-ups can be reversed (%s -> NOT_REVERSIBLE)', async (kind) => {
      repo.findLedgerById.mockResolvedValue(topupRow({ kind, amount: -50 }));

      await expect(creditService.reverse('ledger-1', {}, ACTOR)).rejects.toMatchObject({
        statusCode: 409,
        code: 'NOT_REVERSIBLE',
      });
      expect(repo.withTransaction).not.toHaveBeenCalled();
    });

    it('a top-up can be reversed at most once', async () => {
      repo.findReversalOf.mockResolvedValue({ id: 'rev-1' });

      await expect(creditService.reverse('ledger-1', {}, ACTOR)).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALREADY_REVERSED',
      });
      expect(repo.insertLedger).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refuses when the points were already spent, so the balance can never go negative', async () => {
      repo.getAvailability.mockResolvedValue({ balance: 30000, held: 0, available: 30000 });

      await expect(creditService.reverse('ledger-1', {}, ACTOR)).rejects.toMatchObject({
        statusCode: 409,
        code: 'CREDITS_ALREADY_SPENT',
      });
      expect(repo.insertLedger).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('counts active holds as spent: balance is enough but available is not', async () => {
      repo.getAvailability.mockResolvedValue({ balance: 100000, held: 6000, available: 94000 });

      await expect(creditService.reverse('ledger-1', {}, ACTOR)).rejects.toMatchObject({
        code: 'CREDITS_ALREADY_SPENT',
      });
    });

    it('checks the existing reversal and availability inside the tenant lock', async () => {
      await creditService.reverse('ledger-1', {}, ACTOR);

      const lockOrder = repo.lockTenant.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(repo.findReversalOf.mock.invocationCallOrder[0]);
      expect(lockOrder).toBeLessThan(repo.getAvailability.mock.invocationCallOrder[0]);
    });
  });

  describe('listing', () => {
    it('passes pagination straight through', async () => {
      repo.listLedger.mockResolvedValue({ items: [], total: 0 });
      repo.listOperatorEntries.mockResolvedValue({ items: [], total: 0 });

      await creditService.listLedger('tenant-1', { page: 2, limit: 10 });
      await creditService.listOperatorEntries({ page: 1, limit: 50 });

      expect(repo.listLedger).toHaveBeenCalledWith('tenant-1', { page: 2, limit: 10 });
      expect(repo.listOperatorEntries).toHaveBeenCalledWith({ page: 1, limit: 50 });
    });
  });

  it('CreditConflictError is a 409 AppError carrying its code', () => {
    const error = new CreditConflictError('ALREADY_REVERSED', 'x');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('ALREADY_REVERSED');
    expect(error.name).toBe('CreditConflictError');
  });
});
