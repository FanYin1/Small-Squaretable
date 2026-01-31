-- Add search_vector column to characters table
ALTER TABLE "characters" ADD COLUMN "search_vector" tsvector;

-- Create GIN index for full-text search performance
CREATE INDEX "characters_search_idx" ON "characters" USING GIN("search_vector");

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
