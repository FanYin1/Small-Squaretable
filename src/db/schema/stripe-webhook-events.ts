/**
 * Stripe Webhook 事件去重表
 *
 * Stripe 明确保证 at-least-once 投递：网络抖动、我们返回 5xx、或者它自己重试，
 * 同一个 event.id 会被投递多次。没有去重的话，一次 checkout.session.completed
 * 重投就会再走一遍发权限的逻辑。
 *
 * 用 event_id 作为主键，靠 INSERT ... ON CONFLICT DO NOTHING 来抢占处理权 ——
 * 唯一约束由数据库保证，并发投递不会都抢到。
 */

import { pgTable, varchar, timestamp, text, pgEnum } from 'drizzle-orm/pg-core';

export const stripeWebhookEventStatusEnum = pgEnum('stripe_webhook_event_status', [
  'processing',
  'processed',
  'failed',
]);

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  /** Stripe 的 event.id（evt_...），全局唯一且在重投时保持不变 */
  eventId: varchar('event_id', { length: 255 }).primaryKey(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  status: stripeWebhookEventStatusEnum('status').default('processing').notNull(),
  /** 最近一次失败原因，便于排查为什么某笔订阅没生效 */
  lastError: text('last_error'),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
