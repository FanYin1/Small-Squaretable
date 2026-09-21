-- Migration: 角色审核状态 + 举报违规分类
-- Date: 2026-09-26
-- Description: 让审核处置真正作用于业务状态。
--
--   此前 moderationService.takeAction('hide') 只往 moderation_actions
--   插一行日志，不改 characters 的任何字段，而 moderation_actions 除了
--   测试 mock 没有任何生产读取方。结果是管理员在后台点「隐藏」，接口
--   返回 200 Content hidden，角色在 marketplace 里照常可见。
--
--   characters.moderation_status 补上这个缺失的状态，公开发现入口一并
--   过滤它。reports.category 把自由文本 reason 升级为可统计的枚举——
--   暴力内容此前在 schema 里完全没有表达能力。

DO $$ BEGIN
  CREATE TYPE violation_category AS ENUM (
    'pornography', 'violence', 'harassment', 'infringement', 'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE moderation_status AS ENUM (
    'draft', 'pending', 'approved', 'rejected', 'hidden'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- characters：审核状态字段
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS moderation_status moderation_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS violation_category violation_category,
  ADD COLUMN IF NOT EXISTS moderation_note TEXT,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 存量数据：已公开的角色一次性标为 approved，不回溯审核。
-- 否则默认值 draft 会让所有现有公开角色在部署瞬间从 marketplace 消失。
-- 已标记 is_nsfw 的除外——平台不允许色情内容，这些直接进 hidden 等处置。
UPDATE characters
  SET moderation_status = 'approved'
  WHERE is_public = TRUE AND is_nsfw = FALSE AND moderation_status = 'draft';

UPDATE characters
  SET moderation_status = 'hidden',
      violation_category = 'pornography',
      moderation_note = '存量 is_nsfw 标记，迁移时自动下架待人工复核'
  WHERE is_nsfw = TRUE AND moderation_status = 'draft';

CREATE INDEX IF NOT EXISTS idx_characters_moderation_status
  ON characters (moderation_status);
CREATE INDEX IF NOT EXISTS idx_characters_public_visible
  ON characters (is_public, is_nsfw, moderation_status);

-- reports：违规分类。存量行取 'other'，因为无法从自由文本回溯分类。
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS category violation_category NOT NULL DEFAULT 'other';

CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
  ON reports (status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_target
  ON reports (target_type, target_id);
