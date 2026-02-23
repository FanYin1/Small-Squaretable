-- Performance indexes for Iteration 32
-- Adds missing indexes on character_memories and characters tables

-- character_memories: used in every memory retrieval query
CREATE INDEX IF NOT EXISTS idx_character_memories_char_user
  ON character_memories (character_id, user_id);

-- character_memories: used for session-scoped memory queries
CREATE INDEX IF NOT EXISTS idx_character_memories_source_chat
  ON character_memories (source_chat_id);

-- characters: used by marketplace ORDER BY download_count DESC
CREATE INDEX IF NOT EXISTS idx_characters_public_downloads
  ON characters (is_public, download_count DESC);
