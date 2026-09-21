-- Migration: Create stripe_webhook_events table
-- Date: 2026-09-21
-- Description: Stripe webhook 事件去重表。Stripe 是 at-least-once 投递，
--              同一个 event.id 会重投；没有这张表的话，一次
--              checkout.session.completed 重投就会重复发放订阅权限。
--              event_id 做主键，处理前用 INSERT ... ON CONFLICT DO NOTHING
--              抢占处理权，唯一性由数据库保证，并发重投不会都抢到。

DO $$ BEGIN
  CREATE TYPE stripe_webhook_event_status AS ENUM ('processing', 'processed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  status stripe_webhook_event_status NOT NULL DEFAULT 'processing',

  -- 最近一次失败原因，便于排查「这笔订阅为什么没生效」
  last_error TEXT,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- 排查用：按状态找失败/卡住的事件；卡在 processing 超过 5 分钟的会被重投重新抢占
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_received
  ON stripe_webhook_events (status, received_at);
