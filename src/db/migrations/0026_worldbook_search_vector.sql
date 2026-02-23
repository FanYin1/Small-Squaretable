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
