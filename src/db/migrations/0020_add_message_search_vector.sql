-- Migration: Add tsvector full-text search to messages table
-- Uses 'simple' text search config for CJK compatibility

-- Step 1: Add search_vector column
ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Step 2: Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON messages USING GIN (search_vector);

-- Step 3: Create trigger function to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION messages_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger on messages table (drop first for idempotency)
DROP TRIGGER IF EXISTS trg_messages_search_vector ON messages;
CREATE TRIGGER trg_messages_search_vector
  BEFORE INSERT OR UPDATE OF content ON messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_search_vector_update();

-- Step 5: Backfill existing rows
UPDATE messages SET search_vector = to_tsvector('simple', content) WHERE search_vector IS NULL;
