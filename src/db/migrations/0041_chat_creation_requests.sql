CREATE TABLE "chat_creation_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "request_id" uuid NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "chat_id" uuid REFERENCES "chats"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_creation_requests_owner_request"
  ON "chat_creation_requests" ("tenant_id", "user_id", "request_id");
