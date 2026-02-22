-- Character share tokens
ALTER TABLE characters ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_characters_share_token ON characters(share_token) WHERE share_token IS NOT NULL;

-- Character fork lineage
ALTER TABLE characters ADD COLUMN IF NOT EXISTS forked_from_id UUID REFERENCES characters(id) ON DELETE SET NULL;

-- Chat snapshots
CREATE TABLE IF NOT EXISTS chat_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_token VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(500),
  messages JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  character_name VARCHAR(255),
  character_avatar TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_snapshots_share_token ON chat_snapshots(share_token);
CREATE INDEX IF NOT EXISTS idx_chat_snapshots_user_id ON chat_snapshots(user_id);

-- Character collaborators
CREATE TABLE IF NOT EXISTS character_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_character_collaborators_character_id ON character_collaborators(character_id);
CREATE INDEX IF NOT EXISTS idx_character_collaborators_user_id ON character_collaborators(user_id);

-- Character templates (full card templates, not chat templates)
CREATE TABLE IF NOT EXISTS character_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  avatar_url TEXT,
  card_data JSONB NOT NULL,
  category VARCHAR(50),
  tags TEXT[],
  is_public BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_character_templates_is_public ON character_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_character_templates_category ON character_templates(category);
