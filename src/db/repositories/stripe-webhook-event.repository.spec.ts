import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripeWebhookEventRepository } from './stripe-webhook-event.repository';

/**
 * 去重表的抢占逻辑。
 *
 * 这里验的是 claim() 的决策，以及它是不是真的把唯一性交给了数据库：
 * 「先 SELECT 再 INSERT」在 Stripe 并发重投下两边都会读到空然后都插入，
 * 所以必须是 INSERT ... ON CONFLICT DO NOTHING + 看 returning 的行数。
 */

type Thenable<T> = { then: (r: (v: T) => unknown) => unknown };

/** drizzle 的链式 builder：每一步返回自己，最后 await 时 resolve 成 rows */
const chain = <T>(rows: T[]) => {
  const self: any = {
    values: () => self,
    onConflictDoNothing: () => self,
    set: () => self,
    where: () => self,
    returning: () => Promise.resolve(rows),
    then: (r: (v: T[]) => unknown) => Promise.resolve(rows).then(r),
  };
  return self as Thenable<T[]> & Record<string, any>;
};

describe('StripeWebhookEventRepository.claim', () => {
  let insertRows: unknown[];
  let updateRowsQueue: unknown[][];
  let db: any;
  let repo: StripeWebhookEventRepository;

  beforeEach(() => {
    insertRows = [];
    updateRowsQueue = [];
    db = {
      insert: vi.fn(() => chain(insertRows)),
      update: vi.fn(() => chain(updateRowsQueue.shift() ?? [])),
      select: vi.fn(() => chain([])),
    };
    repo = new StripeWebhookEventRepository(db);
  });

  it('claims a brand new event via the insert', async () => {
    insertRows = [{ eventId: 'evt_1' }];

    await expect(repo.claim('evt_1', 'invoice.paid')).resolves.toBe(true);
    expect(db.insert).toHaveBeenCalledOnce();
    // 新事件不该触发任何 UPDATE
    expect(db.update).not.toHaveBeenCalled();
  });

  it('refuses a duplicate that is already processed or in flight', async () => {
    insertRows = []; // ON CONFLICT DO NOTHING -> 0 行
    updateRowsQueue = [[], []]; // 既不是 failed，也没卡够久

    await expect(repo.claim('evt_dup', 'invoice.paid')).resolves.toBe(false);
  });

  it('reclaims an event whose previous attempt failed', async () => {
    insertRows = [];
    updateRowsQueue = [[{ eventId: 'evt_retry' }]]; // status='failed' 的 UPDATE 命中

    await expect(repo.claim('evt_retry', 'invoice.paid')).resolves.toBe(true);
  });

  it('unsticks an event left in processing by a crashed handler', async () => {
    insertRows = [];
    updateRowsQueue = [
      [], // 不是 failed
      [{ eventId: 'evt_stuck' }], // processing 且 received_at 早于阈值
    ];

    await expect(repo.claim('evt_stuck', 'invoice.paid')).resolves.toBe(true);
  });

  it('relies on the DB conflict clause rather than a read-then-write', async () => {
    insertRows = [{ eventId: 'evt_1' }];
    await repo.claim('evt_1', 'invoice.paid');

    // 抢占路径上不能有 SELECT：并发重投时两个 SELECT 都会读到空
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe('StripeWebhookEventRepository terminal states', () => {
  let db: any;
  let repo: StripeWebhookEventRepository;
  let lastSet: Record<string, unknown> | undefined;

  beforeEach(() => {
    lastSet = undefined;
    const builder: any = {
      set: (v: Record<string, unknown>) => {
        lastSet = v;
        return builder;
      },
      where: () => Promise.resolve([]),
    };
    db = { update: vi.fn(() => builder) };
    repo = new StripeWebhookEventRepository(db);
  });

  it('clears the previous error when marking processed', async () => {
    await repo.markProcessed('evt_1');
    expect(lastSet).toMatchObject({ status: 'processed', lastError: null });
    expect(lastSet?.processedAt).toBeInstanceOf(Date);
  });

  it('truncates an oversized error so one bad payload cannot blow up the row', async () => {
    await repo.markFailed('evt_1', 'x'.repeat(5000));
    expect(lastSet).toMatchObject({ status: 'failed' });
    expect((lastSet?.lastError as string).length).toBe(2000);
  });
});
