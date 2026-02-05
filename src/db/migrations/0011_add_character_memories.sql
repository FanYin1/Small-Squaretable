-- Character memories table for long-term memory storage

CREATE TABLE character_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,

  importance DECIMAL(3,2) DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,

  source_chat_id UUID REFERENCES chats(id) ON DELETE SET NULL,
  source_message_id INTEGER,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  CONSTRAINT unique_memory UNIQUE (character_id, user_id, content)
);

CREATE TABLE character_memory_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES character_memories(id) ON DELETE CASCADE,
  embedding vector(384),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX idx_memories_character_user ON character_memories(character_id, user_id);
CREATE INDEX idx_memories_type ON character_memories(type);
CREATE INDEX idx_memories_importance ON character_memories(importance DESC);
CREATE INDEX idx_memories_last_accessed ON character_memories(last_accessed DESC);

-- HNSW index for fast vector similarity search
CREATE INDEX idx_memory_vectors_embedding ON character_memory_vectors
  USING hnsw (embedding vector_cosine_ops);
