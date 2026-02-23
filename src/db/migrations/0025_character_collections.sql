CREATE TABLE IF NOT EXISTS character_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS character_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES character_collections(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(collection_id, character_id)
);

CREATE INDEX idx_collections_user ON character_collections(user_id);
CREATE INDEX idx_collection_items_collection ON character_collection_items(collection_id);
CREATE INDEX idx_collection_items_character ON character_collection_items(character_id);
