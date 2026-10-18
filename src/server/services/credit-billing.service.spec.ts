import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 预扣 / 结算 / 释放 / 清扫的业务规则。
 *
 * 这里用一个内存版 repository，只模拟两件事：
 *   - 租户级咨询锁：lockTenant 之后，同一租户的其它事务排队到本事务结束（事务级锁语义）
 *   - 条件 UPDATE：closeReservation 只在当前状态命中时生效
 * 它验证的是 service 的「锁内检查 + 写冻结」逻辑在并发下是否正确。
 * PostgreSQL 真实的锁与约束行为在真实库上验证（见 scripts 里的并发脚本与最终报告）。
 */

interface Reservation {
  id: string;
  tenantId: string;
  tokens: number;
  status: 'active' | 'settled' | 'released' | 'expired';
  chatId: string | null;
  chargedTokens: number | null;
  expiresAt: 'future' | 'past';
}
interface Ledger {
  tenantId: string;
  kind: string;
  amount: number;
  reservationId?: string | null;
  chatId?: string | null;
  messageId?: number | null;
  metadata?: Record<string, unknown>;
}

const { fake } = vi.hoisted(() => {
  const state = {
    reservations: [] as any[],
    ledger: [] as any[],
    locks: new Map<string, Promise<void>>(),
    seq: 0,
  };

  const repo = {
    async withTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const tx = { releases: [] as Array<() => void> };
      try {
        return await fn(tx);
      } finally {
        tx.releases.forEach((release) => release());
      }
    },
    async lockTenant(tenantId: string, tx: any) {
      const previous = state.locks.get(tenantId) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((resolve) => (release = resolve));
      state.locks.set(tenantId, previous.then(() => mine));
      tx.releases.push(release);
      await previous;
    },
    async getAvailability(tenantId: string) {
      // 让出事件循环，放大「没有锁时」的竞态窗口
      await new Promise((r) => setImmediate(r));
      const balance = state.ledger.filter((l) => l.tenantId === tenantId).reduce((s, l) => s + l.amount, 0);
      const held = state.reservations
        .filter((r) => r.tenantId === tenantId && r.status === 'active')
        .reduce((s, r) => s + r.tokens, 0);
      return { balance, held, available: balance - held };
    },
    async insertReservation(data: any) {
      await new Promise((r) => setImmediate(r));
      const row = { id: `r${++state.seq}`, status: 'active', chargedTokens: null, ...data };
      state.reservations.push(row);
      return row;
    },
    async findReservation(id: string) {
      return state.reservations.find((r) => r.id === id) ?? null;
    },
    async closeReservation(id: string, from: string[], to: string, charged: number | null) {
      const row = state.reservations.find((r) => r.id === id);
      if (!row || !from.includes(row.status)) return null;
      row.status = to;
      row.chargedTokens = charged;
      return row;
    },
    async expireDue() {
      const due = state.reservations.filter((r) => r.status === 'active' && r.expiresAt === 'past');
      due.forEach((r) => (r.status = 'expired'));
      return due.length;
    },
    async insertLedger(data: any) {
      const row = { id: `l${++state.seq}`, ...data };
      if (row.kind === 'charge' && state.ledger.some((l) => l.reservationId && l.reservationId === row.reservationId)) {
        throw new Error('duplicate reservation_id');
      }
      state.ledger.push(row);
      return row;
    },
  };

  const reset = () => {
    state.reservations.length = 0;
    state.ledger.length = 0;
    state.locks.clear();
    state.seq = 0;
  };
  return { fake: { repo, state, reset } };
});

vi.mock('../../db/repositories/credit.repository', () => ({ creditRepository: fake.repo }));
vi.mock('../../core/config', () => ({
  config: { billingMode: 'credits', creditTokensPerPoint: 10000, creditReservationTtlSeconds: 900 },
}));
vi.mock('./logger.service', () => ({
  logger: { child: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
// sql`now() + ...` 在这里只需要是个占位对象
vi.mock('drizzle-orm', async (importOriginal) => ({ ...(await importOriginal<object>()) }));

import {
  creditBilling,
  InsufficientCreditsError,
  DEFAULT_MAX_OUTPUT_TOKENS,
  HARD_MAX_OUTPUT_TOKENS,
} from './credit-billing.service';

const TENANT = 't1';

function topUp(tenantId: string, amount: number) {
  fake.state.ledger.push({ id: `seed${fake.state.seq++}`, tenantId, kind: 'topup', amount });
}
const ledgerSum = (tenantId: string) =>
  fake.state.ledger.filter((l: Ledger) => l.tenantId === tenantId).reduce((s: number, l: Ledger) => s + l.amount, 0);
const activeHeld = (tenantId: string) =>
  fake.state.reservations
    .filter((r: Reservation) => r.tenantId === tenantId && r.status === 'active')
    .reduce((s: number, r: Reservation) => s + r.tokens, 0);

beforeEach(() => fake.reset());

describe('resolveMaxOutputTokens / computeHoldTokens', () => {
  it('请求没带 max_tokens 用默认上限；带了就尊重但不超过天花板', () => {
    expect(creditBilling.resolveMaxOutputTokens(undefined)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(creditBilling.resolveMaxOutputTokens(0)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(creditBilling.resolveMaxOutputTokens(512)).toBe(512);
    expect(creditBilling.resolveMaxOutputTokens(10_000_000)).toBe(HARD_MAX_OUTPUT_TOKENS);
  });

  it('冻结额 = 输入估算 x 1.2 向上取整 + 输出上限', () => {
    expect(creditBilling.computeHoldTokens(1000, 2048)).toBe(1200 + 2048);
    expect(creditBilling.computeHoldTokens(0, 100)).toBe(100);
    expect(creditBilling.computeHoldTokens(-5, 100)).toBe(100);
  });
});

describe('reserve', () => {
  it('余额足够：写入冻结，返回 hold', async () => {
    topUp(TENANT, 10_000);

    const hold = await creditBilling.reserve({
      tenantId: TENANT,
      chatId: 'c1',
      estimatedInputTokens: 1000,
      maxOutputTokens: 2000,
    });

    expect(hold.tokens).toBe(3200);
    expect(hold.maxOutputTokens).toBe(2000);
    expect(activeHeld(TENANT)).toBe(3200);
    expect(fake.state.reservations[0].chatId).toBe('c1');
  });

  it('可用额度不足：抛 INSUFFICIENT_CREDITS(402)，不留下冻结', async () => {
    topUp(TENANT, 1000);

    const err = await creditBilling
      .reserve({ tenantId: TENANT, estimatedInputTokens: 1000, maxOutputTokens: 2000 })
      .catch((e) => e);

    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(err.details).toMatchObject({ requiredTokens: 3200, availableTokens: 1000 });
    expect(fake.state.reservations).toHaveLength(0);
  });

  it('零余额：直接拒绝', async () => {
    await expect(
      creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 1, maxOutputTokens: 1 }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it('已有冻结占住的额度不能再被预扣（可用 = 账本 - 活动冻结）', async () => {
    topUp(TENANT, 5000);
    await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 3000 });

    await expect(
      creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 3000 }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 2000 });
    expect(activeHeld(TENANT)).toBe(5000);
  });

  it('并发：20 个请求抢 5 份额度，恰好 5 个成功，冻结合计不超过余额', async () => {
    topUp(TENANT, 5 * 1000);

    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 }),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(5);
    expect(rejected).toHaveLength(15);
    expect(rejected.every((r) => r.reason instanceof InsufficientCreditsError)).toBe(true);
    expect(activeHeld(TENANT)).toBe(5000);
    expect(activeHeld(TENANT)).toBeLessThanOrEqual(ledgerSum(TENANT));
  });

  it('不同租户互不影响', async () => {
    topUp('a', 1000);
    topUp('b', 1000);

    const [ra, rb] = await Promise.allSettled([
      creditBilling.reserve({ tenantId: 'a', estimatedInputTokens: 0, maxOutputTokens: 1000 }),
      creditBilling.reserve({ tenantId: 'b', estimatedInputTokens: 0, maxOutputTokens: 1000 }),
    ]);

    expect(ra.status).toBe('fulfilled');
    expect(rb.status).toBe('fulfilled');
  });
});

describe('settle', () => {
  it('按实际用量扣费，剩余额度回到可用，流水可追溯到 chat / message', async () => {
    topUp(TENANT, 10_000);
    const hold = await creditBilling.reserve({
      tenantId: TENANT,
      chatId: 'c1',
      estimatedInputTokens: 1000,
      maxOutputTokens: 2000,
    });

    const result = await creditBilling.settle(hold.id, {
      inputTokens: 900,
      outputTokens: 300,
      chatId: 'c1',
      messageId: 42,
    });

    expect(result).toEqual({ chargedTokens: 1200, clamped: false });
    expect(ledgerSum(TENANT)).toBe(10_000 - 1200);
    expect(activeHeld(TENANT)).toBe(0);
    const charge = fake.state.ledger.find((l: Ledger) => l.kind === 'charge');
    expect(charge).toMatchObject({
      amount: -1200,
      reservationId: hold.id,
      chatId: 'c1',
      messageId: 42,
      metadata: { inputTokens: 900, outputTokens: 300, reservedTokens: hold.tokens },
    });
  });

  it('零用量：关闭冻结但不写扣费行', async () => {
    topUp(TENANT, 5000);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 });

    const result = await creditBilling.settle(hold.id, { inputTokens: 0, outputTokens: 0 });

    expect(result).toEqual({ chargedTokens: 0, clamped: false });
    expect(fake.state.ledger.filter((l: Ledger) => l.kind === 'charge')).toHaveLength(0);
    expect(activeHeld(TENANT)).toBe(0);
  });

  it('实际用量超过冻结额：钳到冻结额，并在流水里记 actualTokens', async () => {
    topUp(TENANT, 10_000);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 });

    const result = await creditBilling.settle(hold.id, { inputTokens: 800, outputTokens: 900 });

    expect(result).toEqual({ chargedTokens: 1000, clamped: true });
    const charge = fake.state.ledger.find((l: Ledger) => l.kind === 'charge');
    expect(charge.metadata).toMatchObject({ clamped: true, actualTokens: 1700 });
  });

  it('幂等：重复结算只扣一次', async () => {
    topUp(TENANT, 10_000);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 });

    const first = await creditBilling.settle(hold.id, { inputTokens: 100, outputTokens: 100 });
    const second = await creditBilling.settle(hold.id, { inputTokens: 100, outputTokens: 100 });

    expect(first?.chargedTokens).toBe(200);
    expect(second).toBeNull();
    expect(ledgerSum(TENANT)).toBe(10_000 - 200);
  });

  it('已释放的冻结不能再结算', async () => {
    topUp(TENANT, 10_000);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 });
    await creditBilling.release(hold.id);

    expect(await creditBilling.settle(hold.id, { inputTokens: 100, outputTokens: 100 })).toBeNull();
    expect(ledgerSum(TENANT)).toBe(10_000);
  });

  it('不存在的冻结 id：返回 null，不抛错', async () => {
    expect(await creditBilling.settle('nope', { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });

  it('已过期被清扫的冻结仍可迟到结算，且按当前余额钳制，账本不为负', async () => {
    topUp(TENANT, 1500);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 });
    fake.state.reservations[0].expiresAt = 'past';
    await creditBilling.sweepExpired();
    expect(fake.state.reservations[0].status).toBe('expired');

    // 额度被清扫放回后，又被另一次生成结算掉了大半
    fake.state.ledger.push({ id: 'x', tenantId: TENANT, kind: 'charge', amount: -1200, reservationId: 'other' });

    const result = await creditBilling.settle(hold.id, { inputTokens: 500, outputTokens: 500 });

    expect(result).toEqual({ chargedTokens: 300, clamped: true });
    expect(ledgerSum(TENANT)).toBe(0);
    const charge = fake.state.ledger.find((l: Ledger) => l.reservationId === hold.id);
    expect(charge.metadata).toMatchObject({ lateSettle: true, actualTokens: 1000 });
  });

  it('并发：预扣 + 结算混合执行后，账本合计永不为负', async () => {
    topUp(TENANT, 3000);

    await Promise.all(
      Array.from({ length: 12 }, async () => {
        try {
          const hold = await creditBilling.reserve({
            tenantId: TENANT,
            estimatedInputTokens: 0,
            maxOutputTokens: 1000,
          });
          // 估算偏低：实际输出超过冻结额
          await creditBilling.settle(hold.id, { inputTokens: 600, outputTokens: 900 });
        } catch (e) {
          if (!(e instanceof InsufficientCreditsError)) throw e;
        }
      }),
    );

    expect(ledgerSum(TENANT)).toBeGreaterThanOrEqual(0);
    expect(activeHeld(TENANT)).toBe(0);
  });
});

describe('release', () => {
  it('释放活动冻结：额度立即回到可用，不写扣费行', async () => {
    topUp(TENANT, 5000);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 5000 });

    expect(await creditBilling.release(hold.id)).toBe(true);

    expect(activeHeld(TENANT)).toBe(0);
    expect(ledgerSum(TENANT)).toBe(5000);
    await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 5000 });
  });

  it('幂等：重复释放第二次返回 false', async () => {
    topUp(TENANT, 5000);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 });

    expect(await creditBilling.release(hold.id)).toBe(true);
    expect(await creditBilling.release(hold.id)).toBe(false);
  });

  it('已结算的冻结不能被释放', async () => {
    topUp(TENANT, 5000);
    const hold = await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 1000 });
    await creditBilling.settle(hold.id, { inputTokens: 10, outputTokens: 10 });

    expect(await creditBilling.release(hold.id)).toBe(false);
    expect(ledgerSum(TENANT)).toBe(4980);
  });
});

describe('sweepExpired / assertHasCredits / isEnabled', () => {
  it('清扫只处理已过期的活动冻结，额度随之放回', async () => {
    topUp(TENANT, 4000);
    await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 2000 });
    await creditBilling.reserve({ tenantId: TENANT, estimatedInputTokens: 0, maxOutputTokens: 2000 });
    fake.state.reservations[0].expiresAt = 'past';

    expect(await creditBilling.sweepExpired()).toBe(1);

    expect(fake.state.reservations.map((r: Reservation) => r.status)).toEqual(['expired', 'active']);
    expect(activeHeld(TENANT)).toBe(2000);
    expect(await creditBilling.sweepExpired()).toBe(0);
  });

  it('assertHasCredits：可用额度 > 0 通过，否则 402', async () => {
    await expect(creditBilling.assertHasCredits(TENANT)).rejects.toBeInstanceOf(InsufficientCreditsError);
    topUp(TENANT, 10);
    await expect(creditBilling.assertHasCredits(TENANT)).resolves.toBeUndefined();
  });

  it('isEnabled 跟随 BILLING_MODE', () => {
    expect(creditBilling.isEnabled()).toBe(true);
  });
});
