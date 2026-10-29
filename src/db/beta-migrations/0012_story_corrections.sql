CREATE TABLE story_branches (
  chat_id uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  root_id uuid NOT NULL, parent_id uuid NOT NULL,
  through_version integer NOT NULL CHECK (through_version >= 0),
  mode text NOT NULL CHECK (mode IN ('choice', 'evidenced', 'conflict', 'adaptation')),
  direction text NOT NULL, evidence_ids jsonb NOT NULL CHECK (jsonb_typeof(evidence_ids) = 'array')
);
CREATE TABLE story_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('annotation', 'layout')),
  content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  UNIQUE (chat_id, request_id)
);
