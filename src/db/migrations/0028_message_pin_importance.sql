-- Add pinned and importance fields to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10);

-- Create index for pinned messages (for quick filtering)
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON messages(chat_id, pinned) WHERE pinned = TRUE;

-- Create index for importance (for context selection optimization)
CREATE INDEX IF NOT EXISTS idx_messages_importance ON messages(chat_id, importance DESC, created_at DESC);

COMMENT ON COLUMN messages.pinned IS 'Whether this message is pinned (always included in context)';
COMMENT ON COLUMN messages.importance IS 'Message importance score (1-10), used for context selection priority';
