-- Migration: 订阅权限吊销（退款 / 拒付）
-- Date: 2026-09-26
-- Description: 退款和拒付之前完全不影响权限。
--
--   webhook 只处理 checkout.session.completed / customer.subscription.*
--   / invoice.*，而退款不会改变订阅状态——Stripe 侧退的是某一期账单，
--   subscription 往往仍然是 active。结果是用户申请全额退款拿回钱后，
--   Pro 功能照常可用，直到订阅自然到期。拒付更糟：裁决要几十天。
--
--   不复用 status 字段，因为 status 由订阅状态同步驱动，下一次
--   customer.subscription.updated 会无条件覆写它，把权限又还回去。
--   单独两个字段，只由退款/拒付事件写。

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_reason VARCHAR(32);

-- 存量数据不回溯：历史退款记录在 Stripe 那边，这里无法可靠重建
-- 「哪笔退款对应哪个租户的哪个周期」，硬猜会误伤正常付费用户。
-- 新字段默认 NULL，即未吊销，与迁移前行为一致。

-- 排查用：找出当前被吊销的租户（数量少，部分索引足够）
CREATE INDEX IF NOT EXISTS idx_subscriptions_revoked
  ON subscriptions (revoked_at)
  WHERE revoked_at IS NOT NULL;
