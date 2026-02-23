-- Add read receipt tracking to chats table
ALTER TABLE chats ADD COLUMN IF NOT EXISTS last_read_message_id BIGINT;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;
