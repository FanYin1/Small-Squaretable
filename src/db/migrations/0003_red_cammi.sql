CREATE TYPE "public"."subscription_plan" AS ENUM('free', 'pro', 'team');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('llm_tokens', 'messages', 'images', 'api_calls');--> statement-breakpoint
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
--> statement-breakpoint
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type" "resource_type" NOT NULL,
	"amount" integer NOT NULL,
	"period" varchar(7) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rating_quality_avg" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rating_creativity_avg" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rating_interactivity_avg" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rating_accuracy_avg" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rating_entertainment_avg" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "rating_overall_avg" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "search_vector" "tsvector";--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_tenant_id_idx" ON "usage" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "usage_period_idx" ON "usage" USING btree ("period");--> statement-breakpoint
CREATE INDEX "usage_tenant_period_idx" ON "usage" USING btree ("tenant_id","period");