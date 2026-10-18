-- Migration: 邀请码注册
-- Date: 2026-10-18
-- Description: 注册改为邀请码制（backlog P0-6）。码由运营者在后台生成，
--   可设最大使用次数与过期时间。
--
--   两张表：
--   - invite_codes     码本身与用量计数
--   - invite_code_uses 谁用了哪个码（追溯「这个人是谁邀请的」）
--
--   为什么 invite_code_uses 单独建表而不只靠审计日志：审计写入是
--   fire-and-forget 的，失败只记一条日志；audit_logs 还有按保留期清理的
--   任务。追溯关系必须和建号在同一事务里落库，才能保证「有账号就有
--   使用记录」。审计日志仍然会写，用于和其它操作一起按时间线排查。

CREATE TABLE IF NOT EXISTS invite_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(64) NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  used_count  INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  note        VARCHAR(200),
  disabled    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invite_codes_max_uses CHECK (max_uses >= 1),
  -- 消费走条件更新（used_count < max_uses），这条约束是第二道防线：
  -- 即便有人绕过应用层直接写库，也不会出现用量超过上限。
  CONSTRAINT chk_invite_codes_usage CHECK (used_count <= max_uses)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_codes_code
  ON invite_codes (code);

CREATE INDEX IF NOT EXISTS idx_invite_codes_created_at
  ON invite_codes (created_at);

CREATE TABLE IF NOT EXISTS invite_code_uses (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT：有使用记录的码不允许被物理删除，要停用请用 disabled
  code_id   UUID NOT NULL REFERENCES invite_codes(id) ON DELETE RESTRICT,
  -- 账号被删除（GDPR）后置空：保留「该码被用过」，不保留个人关联
  user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_code_uses_code
  ON invite_code_uses (code_id);

-- 一个账号只能消耗一个码。user_id 置空后多行 NULL 不冲突（NULL 互不相等）。
CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_code_uses_user
  ON invite_code_uses (user_id);

-- 存量用户不回填：他们是在开放注册时期建的号，没有邀请关系可言，
-- invite_code_uses 里也就没有他们的行。登录路径完全不读这两张表。
