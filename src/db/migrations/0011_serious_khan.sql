CREATE TABLE "plugin_installs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" uuid NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_kv_store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "plugin_installs" ADD CONSTRAINT "plugin_installs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_installs" ADD CONSTRAINT "plugin_installs_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_kv_store" ADD CONSTRAINT "plugin_kv_store_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_kv_store" ADD CONSTRAINT "plugin_kv_store_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plugin_installs_user" ON "plugin_installs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_plugin_installs_plugin" ON "plugin_installs" USING btree ("plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plugin_installs_unique" ON "plugin_installs" USING btree ("user_id","plugin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plugin_kv_lookup" ON "plugin_kv_store" USING btree ("plugin_id","user_id","key");--> statement-breakpoint
CREATE INDEX "idx_plugins_author" ON "plugins" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plugins_slug" ON "plugins" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_plugins_published" ON "plugins" USING btree ("is_published");