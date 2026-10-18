-- Migration: 预付点数账本
-- Date: 2026-10-18
-- Description: 预付点数制第一阶段（backlog P3-1）：运营者手动充值，不接支付。
--
--   两张表：
--   - credit_ledger        追加式流水（充值 / 扣费 / 冲正），余额 = SUM(amount)
--   - credit_reservations  生成前的预扣冻结；可用余额 = 余额 - SUM(活动冻结)
--
--   余额不存成可改写的字段：流水是唯一真相，所以下面加了触发器拒绝 UPDATE。
--   （DELETE 不拦：租户被删除（GDPR）时流水随 ON DELETE CASCADE 一起走。）
--
--   单位是 token 的整数。展示时按 CREDIT_TOKENS_PER_POINT 换算成点数。
--   计费主体是 tenant，与 usage 表一致。

CREATE TABLE IF NOT EXISTS credit_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind            VARCHAR(16) NOT NULL,
  -- 带符号：充值为正，扣费为负，冲正与被冲正的那行符号相反
  amount          BIGINT NOT NULL,
  -- 一次预扣最多结算成一笔扣费（唯一索引在下面）
  reservation_id  UUID,
  -- 一笔充值最多被冲正一次（唯一索引在下面）
  reverses_id     UUID REFERENCES credit_ledger(id),
  -- 运营者操作的幂等键，防止重复提交重复充值
  idempotency_key VARCHAR(64),
  -- 追溯用，刻意不设外键：聊天 / 消息被删除后，账仍要留着
  chat_id         UUID,
  message_id      BIGINT,
  operator_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  note            VARCHAR(200),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_credit_ledger_kind
    CHECK (kind IN ('topup', 'charge', 'reversal')),
  CONSTRAINT chk_credit_ledger_amount_sign
    CHECK (
      (kind = 'topup' AND amount > 0)
      OR (kind = 'charge' AND amount < 0)
      OR (kind = 'reversal' AND amount <> 0)
    ),
  CONSTRAINT chk_credit_ledger_reversal_link
    CHECK ((kind = 'reversal') = (reverses_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant_created
  ON credit_ledger (tenant_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_reservation
  ON credit_ledger (reservation_id) WHERE reservation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_reverses
  ON credit_ledger (reverses_id) WHERE reverses_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_ledger_idempotency
  ON credit_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 追加式：UPDATE 一律拒绝。要更正就写一行冲正，不要改旧行。
-- 唯一例外是 operator_id 的 ON DELETE SET NULL：它在库内表现为一次 UPDATE，
-- 不放行的话，做过充值的运营者账号就删不掉了。只放行「operator_id 置空、其余列不变」。
CREATE OR REPLACE FUNCTION credit_ledger_reject_update() RETURNS trigger AS $$
BEGIN
  IF NEW.operator_id IS NULL
     AND OLD.operator_id IS NOT NULL
     AND (to_jsonb(NEW) - 'operator_id') = (to_jsonb(OLD) - 'operator_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'credit_ledger is append-only: UPDATE is not allowed (id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_ledger_no_update ON credit_ledger;
CREATE TRIGGER trg_credit_ledger_no_update
  BEFORE UPDATE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION credit_ledger_reject_update();

CREATE TABLE IF NOT EXISTS credit_reservations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 冻结的 token 数 = 输入估算 x 余量 + 输出上限
  tokens         BIGINT NOT NULL,
  status         VARCHAR(12) NOT NULL DEFAULT 'active',
  chat_id        UUID,
  expires_at     TIMESTAMPTZ NOT NULL,
  closed_at      TIMESTAMPTZ,
  charged_tokens INTEGER,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_credit_reservations_tokens CHECK (tokens > 0),
  CONSTRAINT chk_credit_reservations_status
    CHECK (status IN ('active', 'settled', 'released', 'expired'))
);

-- 预扣检查只看活动冻结，用部分索引保持小
CREATE INDEX IF NOT EXISTS idx_credit_reservations_active_tenant
  ON credit_reservations (tenant_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_credit_reservations_active_expiry
  ON credit_reservations (expires_at) WHERE status = 'active';

-- 存量租户不回填：切到 credits 模式时余额为 0，由运营者充值。
