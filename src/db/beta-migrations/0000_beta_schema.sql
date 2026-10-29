CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TYPE "public"."tenant_plan" AS ENUM('free', 'personal', 'team', 'enterprise');
CREATE TYPE "public"."user_role" AS ENUM('user', 'moderator', 'admin');
CREATE TYPE "public"."moderation_status" AS ENUM('draft', 'pending', 'approved', 'rejected', 'hidden');
CREATE TYPE "public"."violation_category" AS ENUM('pornography', 'violence', 'harassment', 'infringement', 'other');
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system');
CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'pro', 'team');
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing');
CREATE TYPE "public"."resource_type" AS ENUM('llm_tokens', 'messages', 'images', 'api_calls');
CREATE TYPE "public"."worldbook_scope" AS ENUM('global', 'character', 'persona', 'chat');
CREATE TYPE "public"."report_status" AS ENUM('pending', 'resolved', 'dismissed');
CREATE TYPE "public"."experiment_status" AS ENUM('draft', 'running', 'completed');
CREATE TYPE "public"."stripe_webhook_event_status" AS ENUM('processing', 'processed', 'failed');
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"plan" "tenant_plan" DEFAULT 'free' NOT NULL,
	"subscription_id" uuid,
	"stripe_customer_id" varchar(255),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"display_name" varchar(100),
	"avatar_url" varchar(500),
	"bio" varchar(500),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token" varchar(64),
	"totp_secret" varchar(255),
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"deletion_requested_at" timestamp with time zone,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"age_confirmed_at" timestamp with time zone,
	"age_confirmed_ip" varchar(64),
	"show_nsfw" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);

CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"creator_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"avatar_url" text,
	"card_data" jsonb NOT NULL,
	"prompt_template" varchar(50) DEFAULT 'default',
	"tags" text[],
	"category" varchar(50),
	"is_public" boolean DEFAULT false NOT NULL,
	"is_nsfw" boolean DEFAULT false NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'draft' NOT NULL,
	"violation_category" "violation_category",
	"moderation_note" text,
	"moderated_at" timestamp with time zone,
	"moderated_by" uuid,
	"share_token" varchar(64),
	"forked_from_id" uuid,
	"download_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"rating_avg" numeric(3, 2),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"favorite_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"rating_quality_avg" numeric(3, 2),
	"rating_creativity_avg" numeric(3, 2),
	"rating_interactivity_avg" numeric(3, 2),
	"rating_accuracy_avg" numeric(3, 2),
	"rating_entertainment_avg" numeric(3, 2),
	"rating_overall_avg" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector"
);

CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid,
	"persona_id" uuid,
	"title" varchar(500),
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_read_message_id" bigint,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb,
	"extra" jsonb,
	"character_id" uuid,
	"parent_message_id" bigint,
	"pinned" boolean DEFAULT false NOT NULL,
	"importance" integer DEFAULT 5 NOT NULL,
	"search_vector" "tsvector",
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "generation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"request_id" varchar(200) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"status" varchar(16) DEFAULT 'accepted' NOT NULL,
	"user_message_id" bigint,
	"error_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_requests_status_check" CHECK ("generation_requests"."status" IN ('accepted', 'running', 'completed', 'stopped', 'failed'))
);

CREATE TABLE "chat_creation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"chat_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"quality" integer NOT NULL,
	"creativity" integer NOT NULL,
	"interactivity" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"entertainment" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_character_id_user_id_unique" UNIQUE("character_id","user_id")
);

CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_price_id" varchar(255),
	"plan" "subscription_plan" DEFAULT 'free' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"amount" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "character_emotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" uuid,
	"valence" numeric(4, 3) NOT NULL,
	"arousal" numeric(4, 3) NOT NULL,
	"trigger_message_id" integer,
	"trigger_content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "character_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"importance" numeric(3, 2) DEFAULT '0.5',
	"access_count" integer DEFAULT 0,
	"source_chat_id" uuid,
	"source_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "character_memory_vectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"embedding" vector(384),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "worldbook_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worldbook_id" uuid NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"character_filter" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scan_depth" integer,
	"context_percentage" integer,
	"recursive" boolean DEFAULT true NOT NULL,
	"prevent_recursion" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector"
);

CREATE TABLE "worldbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"scope" "worldbook_scope" DEFAULT 'character' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"http_status" integer,
	"response" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);

CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "comment_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"comment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"parent_id" uuid,
	"content" text NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"actor_id" uuid,
	"target_type" varchar(50),
	"target_id" uuid,
	"message" text NOT NULL,
	"group_key" varchar(255),
	"priority" varchar(20) DEFAULT 'normal',
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_hint" varchar(20) NOT NULL,
	"scopes" text[] NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"request_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);

CREATE TABLE "plugin_installs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "plugin_kv_store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"author_id" uuid NOT NULL,
	"entrypoint" text DEFAULT 'index.js' NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"config_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_code" text NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_official" boolean DEFAULT false NOT NULL,
	"install_count" integer DEFAULT 0 NOT NULL,
	"icon_url" text,
	"readme" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugins_slug_unique" UNIQUE("slug")
);

CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "backup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" varchar(60) NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"category" "violation_category" DEFAULT 'other' NOT NULL,
	"reason" text NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moderator_id" uuid NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid NOT NULL,
	"action" varchar(20) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" varchar(36) NOT NULL,
	"actor_ip" varchar(64),
	"action" varchar(50) NOT NULL,
	"target_type" varchar(20),
	"target_id" varchar(36),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" varchar(30) NOT NULL,
	"granted" boolean DEFAULT false NOT NULL,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "experiment_status" DEFAULT 'draft' NOT NULL,
	"variants" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"target_type" varchar(50),
	"target_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "character_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"card_data" jsonb NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "chat_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "message_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "chat_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"system_prompt" text,
	"first_message" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "character_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"target_character_id" uuid,
	"type" varchar(50) NOT NULL,
	"affinity" numeric(4, 3) DEFAULT '0.500' NOT NULL,
	"label" varchar(100),
	"description" text,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "character_growth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"total_chats" integer DEFAULT 0 NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "chat_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"share_token" varchar(64) NOT NULL,
	"title" varchar(500),
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"character_name" varchar(255),
	"character_avatar" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_snapshots_share_token_unique" UNIQUE("share_token")
);

CREATE TABLE "character_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'editor' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_collaborators_character_id_user_id_unique" UNIQUE("character_id","user_id")
);

CREATE TABLE "character_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"avatar_url" text,
	"card_data" jsonb NOT NULL,
	"category" varchar(50),
	"tags" text[],
	"is_public" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT false NOT NULL,
	"email_frequency" varchar(20) DEFAULT 'immediate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_notification_type_unique" UNIQUE("user_id","notification_type")
);

CREATE TABLE "character_collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_collection_character" UNIQUE("collection_id","character_id")
);

CREATE TABLE "character_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(7),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "template_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_ratings_template_id_user_id_unique" UNIQUE("template_id","user_id")
);

CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "quick_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"category" varchar(50),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "user_personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"avatar_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "character_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"preset" jsonb NOT NULL,
	"is_global" boolean DEFAULT false NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "chat_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"overrides" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "stripe_webhook_events" (
	"event_id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"status" "stripe_webhook_event_status" DEFAULT 'processing' NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);

CREATE TABLE "invite_code_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"user_id" uuid,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"note" varchar(200),
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_invite_codes_usage" CHECK ("invite_codes"."used_count" <= "invite_codes"."max_uses"),
	CONSTRAINT "chk_invite_codes_max_uses" CHECK ("invite_codes"."max_uses" >= 1)
);

CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"amount" bigint NOT NULL,
	"reservation_id" uuid,
	"reverses_id" uuid,
	"idempotency_key" varchar(64),
	"chat_id" uuid,
	"message_id" bigint,
	"operator_id" uuid,
	"note" varchar(200),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_credit_ledger_kind" CHECK ("credit_ledger"."kind" IN ('topup', 'charge', 'reversal')),
	CONSTRAINT "chk_credit_ledger_amount_sign" CHECK (("credit_ledger"."kind" = 'topup' AND "credit_ledger"."amount" > 0)
      OR ("credit_ledger"."kind" = 'charge' AND "credit_ledger"."amount" < 0)
      OR ("credit_ledger"."kind" = 'reversal' AND "credit_ledger"."amount" <> 0)),
	CONSTRAINT "chk_credit_ledger_reversal_link" CHECK (("credit_ledger"."kind" = 'reversal') = ("credit_ledger"."reverses_id" IS NOT NULL))
);

CREATE TABLE "credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tokens" bigint NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"chat_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"charged_tokens" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_credit_reservations_tokens" CHECK ("credit_reservations"."tokens" > 0),
	CONSTRAINT "chk_credit_reservations_status" CHECK ("credit_reservations"."status" IN ('active', 'settled', 'released', 'expired'))
);

ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "characters" ADD CONSTRAINT "characters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "characters" ADD CONSTRAINT "characters_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "characters" ADD CONSTRAINT "characters_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "chats" ADD CONSTRAINT "chats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chats" ADD CONSTRAINT "chats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "chats" ADD CONSTRAINT "chats_persona_id_user_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."user_personas"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "messages" ADD CONSTRAINT "messages_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "generation_requests" ADD CONSTRAINT "generation_requests_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "generation_requests" ADD CONSTRAINT "generation_requests_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "chat_creation_requests" ADD CONSTRAINT "chat_creation_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chat_creation_requests" ADD CONSTRAINT "chat_creation_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chat_creation_requests" ADD CONSTRAINT "chat_creation_requests_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "usage" ADD CONSTRAINT "usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_emotions" ADD CONSTRAINT "character_emotions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_emotions" ADD CONSTRAINT "character_emotions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_emotions" ADD CONSTRAINT "character_emotions_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_memories" ADD CONSTRAINT "character_memories_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_memories" ADD CONSTRAINT "character_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_memories" ADD CONSTRAINT "character_memories_source_chat_id_chats_id_fk" FOREIGN KEY ("source_chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "character_memory_vectors" ADD CONSTRAINT "character_memory_vectors_memory_id_character_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."character_memories"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "worldbook_entries" ADD CONSTRAINT "worldbook_entries_worldbook_id_worldbooks_id_fk" FOREIGN KEY ("worldbook_id") REFERENCES "public"."worldbooks"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "worldbooks" ADD CONSTRAINT "worldbooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "worldbooks" ADD CONSTRAINT "worldbooks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "comments" ADD CONSTRAINT "comments_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plugin_installs" ADD CONSTRAINT "plugin_installs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plugin_installs" ADD CONSTRAINT "plugin_installs_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plugin_kv_store" ADD CONSTRAINT "plugin_kv_store_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plugin_kv_store" ADD CONSTRAINT "plugin_kv_store_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "backup_codes" ADD CONSTRAINT "backup_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "chat_characters" ADD CONSTRAINT "chat_characters_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chat_characters" ADD CONSTRAINT "chat_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "message_bookmarks" ADD CONSTRAINT "message_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "message_bookmarks" ADD CONSTRAINT "message_bookmarks_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chat_templates" ADD CONSTRAINT "chat_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_target_character_id_characters_id_fk" FOREIGN KEY ("target_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_growth" ADD CONSTRAINT "character_growth_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_growth" ADD CONSTRAINT "character_growth_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chat_snapshots" ADD CONSTRAINT "chat_snapshots_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chat_snapshots" ADD CONSTRAINT "chat_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_collaborators" ADD CONSTRAINT "character_collaborators_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_collaborators" ADD CONSTRAINT "character_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_collaborators" ADD CONSTRAINT "character_collaborators_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "character_templates" ADD CONSTRAINT "character_templates_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_collection_items" ADD CONSTRAINT "character_collection_items_collection_id_character_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."character_collections"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_collection_items" ADD CONSTRAINT "character_collection_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_collections" ADD CONSTRAINT "character_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_template_id_character_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."character_templates"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_personas" ADD CONSTRAINT "user_personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_presets" ADD CONSTRAINT "character_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "character_presets" ADD CONSTRAINT "character_presets_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "chat_overrides" ADD CONSTRAINT "chat_overrides_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "invite_code_uses" ADD CONSTRAINT "invite_code_uses_code_id_invite_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."invite_codes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "invite_code_uses" ADD CONSTRAINT "invite_code_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_reverses_id_credit_ledger_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."credit_ledger"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_users_tenant_id" ON "users" USING btree ("tenant_id");
CREATE INDEX "idx_characters_tenant_id" ON "characters" USING btree ("tenant_id");
CREATE INDEX "idx_characters_creator_id" ON "characters" USING btree ("creator_id");
CREATE INDEX "idx_characters_is_public" ON "characters" USING btree ("is_public");
CREATE INDEX "idx_characters_is_public_created_at" ON "characters" USING btree ("is_public","created_at");
CREATE INDEX "idx_characters_public_downloads" ON "characters" USING btree ("is_public","download_count");
CREATE INDEX "idx_characters_moderation_status" ON "characters" USING btree ("moderation_status");
CREATE INDEX "idx_characters_public_visible" ON "characters" USING btree ("is_public","is_nsfw","moderation_status");
CREATE INDEX "idx_chats_user_id" ON "chats" USING btree ("user_id");
CREATE INDEX "idx_chats_character_id" ON "chats" USING btree ("character_id");
CREATE INDEX "idx_chats_persona_id" ON "chats" USING btree ("persona_id");
CREATE INDEX "idx_messages_chat_id_sent_at" ON "messages" USING btree ("chat_id","sent_at");
CREATE INDEX "idx_messages_parent_message_id" ON "messages" USING btree ("parent_message_id");
CREATE INDEX "idx_messages_chat_id_role" ON "messages" USING btree ("chat_id","role");
CREATE INDEX "idx_messages_pinned" ON "messages" USING btree ("chat_id","pinned");
CREATE INDEX "idx_messages_importance" ON "messages" USING btree ("chat_id","importance","sent_at");
CREATE UNIQUE INDEX "idx_generation_requests_chat_request" ON "generation_requests" USING btree ("chat_id","request_id");
CREATE UNIQUE INDEX "idx_chat_creation_requests_owner_request" ON "chat_creation_requests" USING btree ("tenant_id","user_id","request_id");
CREATE INDEX "usage_tenant_id_idx" ON "usage" USING btree ("tenant_id");
CREATE INDEX "usage_period_idx" ON "usage" USING btree ("period");
CREATE INDEX "usage_tenant_period_idx" ON "usage" USING btree ("tenant_id","period");
CREATE UNIQUE INDEX "character_emotions_unique_per_chat" ON "character_emotions" USING btree ("character_id","user_id","chat_id") WHERE "character_emotions"."chat_id" IS NOT NULL;
CREATE INDEX "idx_character_memories_char_user" ON "character_memories" USING btree ("character_id","user_id");
CREATE INDEX "idx_character_memories_source_chat" ON "character_memories" USING btree ("source_chat_id");
CREATE INDEX "idx_worldbook_entries_character_filter" ON "worldbook_entries" USING gin ("character_filter");
CREATE INDEX "idx_webhook_deliveries_pending" ON "webhook_deliveries" USING btree ("status","next_retry_at");
CREATE INDEX "idx_webhook_deliveries_endpoint" ON "webhook_deliveries" USING btree ("endpoint_id");
CREATE INDEX "idx_webhook_endpoints_user" ON "webhook_endpoints" USING btree ("user_id");
CREATE UNIQUE INDEX "idx_comment_likes_unique" ON "comment_likes" USING btree ("user_id","comment_id");
CREATE INDEX "idx_comment_likes_comment" ON "comment_likes" USING btree ("comment_id");
CREATE INDEX "idx_comments_character" ON "comments" USING btree ("character_id");
CREATE INDEX "idx_comments_user" ON "comments" USING btree ("user_id");
CREATE INDEX "idx_comments_parent" ON "comments" USING btree ("parent_id");
CREATE INDEX "idx_comments_created_at" ON "comments" USING btree ("created_at");
CREATE UNIQUE INDEX "idx_favorites_unique" ON "favorites" USING btree ("user_id","character_id");
CREATE INDEX "idx_favorites_user" ON "favorites" USING btree ("user_id");
CREATE INDEX "idx_favorites_character" ON "favorites" USING btree ("character_id");
CREATE UNIQUE INDEX "idx_follows_unique" ON "follows" USING btree ("follower_id","following_id");
CREATE INDEX "idx_follows_follower" ON "follows" USING btree ("follower_id");
CREATE INDEX "idx_follows_following" ON "follows" USING btree ("following_id");
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id");
CREATE INDEX "idx_notifications_user_read" ON "notifications" USING btree ("user_id","is_read");
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at");
CREATE INDEX "idx_api_keys_user" ON "api_keys" USING btree ("user_id");
CREATE INDEX "idx_api_keys_hash" ON "api_keys" USING btree ("key_hash");
CREATE INDEX "idx_plugin_installs_user" ON "plugin_installs" USING btree ("user_id");
CREATE INDEX "idx_plugin_installs_plugin" ON "plugin_installs" USING btree ("plugin_id");
CREATE UNIQUE INDEX "idx_plugin_installs_unique" ON "plugin_installs" USING btree ("user_id","plugin_id");
CREATE UNIQUE INDEX "idx_plugin_kv_lookup" ON "plugin_kv_store" USING btree ("plugin_id","user_id","key");
CREATE INDEX "idx_plugins_author" ON "plugins" USING btree ("author_id");
CREATE UNIQUE INDEX "idx_plugins_slug" ON "plugins" USING btree ("slug");
CREATE INDEX "idx_plugins_published" ON "plugins" USING btree ("is_published");
CREATE UNIQUE INDEX "oauth_provider_account_idx" ON "oauth_accounts" USING btree ("provider","provider_account_id");
CREATE INDEX "idx_reports_status_created_at" ON "reports" USING btree ("status","created_at");
CREATE INDEX "idx_reports_target" ON "reports" USING btree ("target_type","target_id");
CREATE INDEX "audit_tenant_idx" ON "audit_logs" USING btree ("tenant_id");
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");
CREATE UNIQUE INDEX "user_consent_unique_idx" ON "user_consents" USING btree ("user_id","consent_type");
CREATE INDEX "idx_activities_user" ON "activities" USING btree ("user_id");
CREATE INDEX "idx_activities_created_at" ON "activities" USING btree ("created_at");
CREATE INDEX "idx_activities_type" ON "activities" USING btree ("type");
CREATE INDEX "idx_character_versions_character" ON "character_versions" USING btree ("character_id");
CREATE INDEX "idx_character_versions_version" ON "character_versions" USING btree ("character_id","version");
CREATE UNIQUE INDEX "idx_chat_characters_unique" ON "chat_characters" USING btree ("chat_id","character_id");
CREATE INDEX "idx_chat_characters_chat" ON "chat_characters" USING btree ("chat_id");
CREATE INDEX "idx_message_bookmarks_user_id" ON "message_bookmarks" USING btree ("user_id");
CREATE INDEX "idx_character_relationships_character_id_user_id" ON "character_relationships" USING btree ("character_id","user_id");
CREATE INDEX "idx_character_growth_character_id_user_id" ON "character_growth" USING btree ("character_id","user_id");
CREATE INDEX "idx_collection_items_collection" ON "character_collection_items" USING btree ("collection_id");
CREATE INDEX "idx_collection_items_character" ON "character_collection_items" USING btree ("character_id");
CREATE INDEX "idx_collections_user" ON "character_collections" USING btree ("user_id");
CREATE UNIQUE INDEX "unique_reaction_idx" ON "message_reactions" USING btree ("message_id","user_id","emoji");
CREATE INDEX "idx_user_personas_user_id" ON "user_personas" USING btree ("user_id");
CREATE INDEX "idx_user_personas_is_default" ON "user_personas" USING btree ("user_id","is_default");
CREATE INDEX "idx_character_presets_user_id" ON "character_presets" USING btree ("user_id");
CREATE INDEX "idx_character_presets_character_id" ON "character_presets" USING btree ("character_id");
CREATE INDEX "idx_chat_overrides_chat_id" ON "chat_overrides" USING btree ("chat_id");
CREATE INDEX "idx_invite_code_uses_code" ON "invite_code_uses" USING btree ("code_id");
CREATE UNIQUE INDEX "uq_invite_code_uses_user" ON "invite_code_uses" USING btree ("user_id");
CREATE UNIQUE INDEX "uq_invite_codes_code" ON "invite_codes" USING btree ("code");
CREATE INDEX "idx_invite_codes_created_at" ON "invite_codes" USING btree ("created_at");
CREATE INDEX "idx_credit_ledger_tenant_created" ON "credit_ledger" USING btree ("tenant_id","created_at");
CREATE UNIQUE INDEX "uq_credit_ledger_reservation" ON "credit_ledger" USING btree ("reservation_id") WHERE "credit_ledger"."reservation_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_credit_ledger_reverses" ON "credit_ledger" USING btree ("reverses_id") WHERE "credit_ledger"."reverses_id" IS NOT NULL;
CREATE UNIQUE INDEX "uq_credit_ledger_idempotency" ON "credit_ledger" USING btree ("idempotency_key") WHERE "credit_ledger"."idempotency_key" IS NOT NULL;
CREATE INDEX "idx_credit_reservations_active_tenant" ON "credit_reservations" USING btree ("tenant_id") WHERE "credit_reservations"."status" = 'active';
CREATE INDEX "idx_credit_reservations_active_expiry" ON "credit_reservations" USING btree ("expires_at") WHERE "credit_reservations"."status" = 'active';
