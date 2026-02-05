-- Performance Optimization Indexes for Small-Squaretable
-- Phase 6.3: Database Query Optimization

-- Characters table indexes
-- Index for marketplace queries (public characters sorted by download count)
CREATE INDEX IF NOT EXISTS idx_characters_marketplace
ON characters (is_public, download_count DESC)
WHERE is_public = true;

-- Index for search queries (full-text search with filters)
CREATE INDEX IF NOT EXISTS idx_characters_search_vector
ON characters USING GIN (search_vector);

-- Index for tenant-based queries
CREATE INDEX IF NOT EXISTS idx_characters_tenant_id
ON characters (tenant_id);

-- Index for creator-based queries
CREATE INDEX IF NOT EXISTS idx_characters_creator_id
ON characters (creator_id);

-- Composite index for category and public status
CREATE INDEX IF NOT EXISTS idx_characters_category_public
ON characters (category, is_public)
WHERE is_public = true;

-- Index for rating-based sorting
CREATE INDEX IF NOT EXISTS idx_characters_rating
ON characters (rating_avg DESC NULLS LAST)
WHERE is_public = true;

-- Index for newest characters
CREATE INDEX IF NOT EXISTS idx_characters_created_at
ON characters (created_at DESC);

-- Chats table indexes
-- Index for user's chat sessions
CREATE INDEX IF NOT EXISTS idx_chats_user_id
ON chats (user_id);

-- Index for tenant-based chat queries
CREATE INDEX IF NOT EXISTS idx_chats_tenant_id
ON chats (tenant_id);

-- Composite index for user's recent chats
CREATE INDEX IF NOT EXISTS idx_chats_user_updated
ON chats (user_id, updated_at DESC);

-- Messages table indexes (if exists)
-- Index for chat messages
CREATE INDEX IF NOT EXISTS idx_messages_chat_id
ON messages (chat_id);

-- Index for message ordering
CREATE INDEX IF NOT EXISTS idx_messages_chat_created
ON messages (chat_id, created_at);

-- Ratings table indexes
-- Index for character ratings
CREATE INDEX IF NOT EXISTS idx_ratings_character_id
ON ratings (character_id);

-- Index for user ratings
CREATE INDEX IF NOT EXISTS idx_ratings_user_id
ON ratings (user_id);

-- Composite index for unique rating lookup
CREATE INDEX IF NOT EXISTS idx_ratings_character_user
ON ratings (character_id, user_id);

-- Users table indexes
-- Index for email lookup (login)
CREATE INDEX IF NOT EXISTS idx_users_email
ON users (email);

-- Index for tenant-based user queries
CREATE INDEX IF NOT EXISTS idx_users_tenant_id
ON users (tenant_id);

-- Subscriptions table indexes
-- Index for user subscription lookup
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
ON subscriptions (user_id);

-- Index for active subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
ON subscriptions (status)
WHERE status = 'active';

-- Usage table indexes
-- Index for user usage tracking
CREATE INDEX IF NOT EXISTS idx_usage_user_id
ON usage (user_id);

-- Index for date-based usage queries
CREATE INDEX IF NOT EXISTS idx_usage_date
ON usage (usage_date);

-- Composite index for user usage by date
CREATE INDEX IF NOT EXISTS idx_usage_user_date
ON usage (user_id, usage_date DESC);

-- Analyze tables to update statistics
ANALYZE characters;
ANALYZE chats;
ANALYZE ratings;
ANALYZE users;
ANALYZE subscriptions;
