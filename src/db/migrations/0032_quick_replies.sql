-- Migration: Create quick_replies table
-- Date: 2026-03-02
-- Description: Adds support for quick reply presets

CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  label VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,

  "order" INTEGER NOT NULL DEFAULT 0,
  category VARCHAR(50),

  is_enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_quick_replies_user_id ON quick_replies(user_id);

-- Create index on user_id + order for sorted queries
CREATE INDEX IF NOT EXISTS idx_quick_replies_user_order ON quick_replies(user_id, "order");

COMMENT ON TABLE quick_replies IS 'User quick reply presets';
COMMENT ON COLUMN quick_replies.label IS 'Button display text';
COMMENT ON COLUMN quick_replies.message IS 'Actual message content (supports macros)';
COMMENT ON COLUMN quick_replies."order" IS 'Display order';
COMMENT ON COLUMN quick_replies.category IS 'Optional category for grouping';
