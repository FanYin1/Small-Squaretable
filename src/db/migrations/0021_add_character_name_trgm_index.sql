CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_characters_name_trgm ON characters USING GIN (name gin_trgm_ops);
