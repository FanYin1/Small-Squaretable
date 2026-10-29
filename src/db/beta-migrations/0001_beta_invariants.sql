-- Add search_vector column to characters table


-- Create GIN index for full-text search performance
CREATE INDEX IF NOT EXISTS "characters_search_idx" ON "characters" USING GIN("search_vector");

-- Create trigger function to automatically update search_vector
CREATE OR REPLACE FUNCTION characters_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function before INSERT or UPDATE
CREATE TRIGGER "characters_search_vector_trigger"
BEFORE INSERT OR UPDATE ON "characters"
FOR EACH ROW EXECUTE FUNCTION characters_search_vector_update();

-- Update existing records with search vectors
UPDATE "characters"
SET search_vector =
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C');

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

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_characters_name_trgm ON characters USING GIN (name gin_trgm_ops);

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

-- Add search_vector to worldbook_entries for full-text search
ALTER TABLE worldbook_entries ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE worldbook_entries SET search_vector =
  setweight(to_tsvector('english', coalesce(keyword, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B');

-- Create GIN index
CREATE INDEX IF NOT EXISTS idx_worldbook_entries_search_vector
  ON worldbook_entries USING gin(search_vector);

-- Create trigger to auto-update search_vector
CREATE OR REPLACE FUNCTION worldbook_entries_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.keyword, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_worldbook_entries_search_vector ON worldbook_entries;
CREATE TRIGGER trg_worldbook_entries_search_vector
  BEFORE INSERT OR UPDATE ON worldbook_entries
  FOR EACH ROW EXECUTE FUNCTION worldbook_entries_search_vector_update();

CREATE OR REPLACE FUNCTION credit_ledger_reject_update() RETURNS trigger AS $$
BEGIN
  IF NEW.operator_id IS NULL
     AND OLD.operator_id IS NOT NULL
     AND (to_jsonb(NEW) - 'operator_id') = (to_jsonb(OLD) - 'operator_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'credit_ledger is append-only: UPDATE is not allowed (id=%)', OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_ledger_no_update ON credit_ledger;
CREATE TRIGGER trg_credit_ledger_no_update
  BEFORE UPDATE ON credit_ledger
  FOR EACH ROW EXECUTE FUNCTION credit_ledger_reject_update();
