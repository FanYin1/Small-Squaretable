-- Auto-run on fresh database init via docker-compose
-- Enables required PostgreSQL extensions before migrations
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
