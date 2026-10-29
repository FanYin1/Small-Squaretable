CREATE TABLE "generation_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" uuid NOT NULL REFERENCES "chats"("id") ON DELETE CASCADE,
  "request_id" varchar(200) NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'accepted',
  "user_message_id" bigint REFERENCES "messages"("id") ON DELETE SET NULL,
  "error_code" varchar(100),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  CONSTRAINT "generation_requests_status_check" CHECK ("status" IN ('accepted', 'running', 'completed', 'stopped', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_generation_requests_chat_request"
  ON "generation_requests" ("chat_id", "request_id");
