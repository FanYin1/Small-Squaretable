import { eq, and, lt } from 'drizzle-orm';
import { BaseRepository } from './base.repository';
import { db } from '../index';
import {
  stripeWebhookEvents,
  type StripeWebhookEvent,
} from '../schema/stripe-webhook-events';

/** 卡在 processing 超过这个时长的事件，认为上一次处理已经崩了，允许重投时重新抢占 */
const STALE_PROCESSING_MS = 5 * 60 * 1000;

export class StripeWebhookEventRepository extends BaseRepository {
  /**
   * 尝试抢占一个事件的处理权。
   *
   * 靠数据库的主键唯一约束来仲裁，而不是「先 SELECT 再 INSERT」——
   * 后者在 Stripe 并发重投下会两个请求都读到空然后都插入。
   *
   * @returns true = 本次调用拿到了处理权；false = 已经有人处理过或正在处理，应当跳过
   */
  async claim(eventId: string, eventType: string): Promise<boolean> {
    const inserted = await this.db
      .insert(stripeWebhookEvents)
      .values({ eventId, eventType, status: 'processing' })
      .onConflictDoNothing()
      .returning({ eventId: stripeWebhookEvents.eventId });

    if (inserted.length > 0) return true;

    // 已存在。只有两种情况值得重试：上一次明确失败，或者卡在 processing 太久
    // （进程在处理中途被杀，没有人会把它推进到终态）。
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
    const reclaimed = await this.db
      .update(stripeWebhookEvents)
      .set({ status: 'processing', receivedAt: new Date(), lastError: null })
      .where(
        and(
          eq(stripeWebhookEvents.eventId, eventId),
          eq(stripeWebhookEvents.status, 'failed')
        )
      )
      .returning({ eventId: stripeWebhookEvents.eventId });

    if (reclaimed.length > 0) return true;

    const unstuck = await this.db
      .update(stripeWebhookEvents)
      .set({ status: 'processing', receivedAt: new Date() })
      .where(
        and(
          eq(stripeWebhookEvents.eventId, eventId),
          eq(stripeWebhookEvents.status, 'processing'),
          lt(stripeWebhookEvents.receivedAt, staleBefore)
        )
      )
      .returning({ eventId: stripeWebhookEvents.eventId });

    return unstuck.length > 0;
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.db
      .update(stripeWebhookEvents)
      .set({ status: 'processed', processedAt: new Date(), lastError: null })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  }

  /**
   * 标记失败。留在库里而不是删掉，是为了「这笔订阅为什么没生效」有据可查；
   * status='failed' 也让下一次 Stripe 重投能重新抢占。
   */
  async markFailed(eventId: string, error: string): Promise<void> {
    await this.db
      .update(stripeWebhookEvents)
      .set({ status: 'failed', lastError: error.slice(0, 2000) })
      .where(eq(stripeWebhookEvents.eventId, eventId));
  }

  async findById(eventId: string): Promise<StripeWebhookEvent | null> {
    const result = await this.db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, eventId));
    return result[0] ?? null;
  }
}

export const stripeWebhookEventRepository = new StripeWebhookEventRepository(db);
