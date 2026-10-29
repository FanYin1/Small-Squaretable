CREATE TABLE story_states (
  chat_id uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  values jsonb NOT NULL CHECK (jsonb_typeof(values) = 'object'),
  completed_actions jsonb NOT NULL DEFAULT '[]', sources jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE story_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  request_id varchar(200) NOT NULL, version integer NOT NULL CHECK (version > 0),
  action_id varchar(64), action_label text, outcome text,
  status varchar(20) NOT NULL CHECK (status IN ('confirmed', 'interrupted')),
  input_message_id bigint REFERENCES messages(id) ON DELETE SET NULL,
  message_id bigint REFERENCES messages(id) ON DELETE SET NULL,
  changes jsonb NOT NULL, excerpt text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX story_events_request_key ON story_events(chat_id, request_id);
CREATE UNIQUE INDEX story_events_version_key ON story_events(chat_id, version);
CREATE TABLE story_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL CHECK (kind IN ('style', 'note', 'thread')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX story_notes_chat_idx ON story_notes(chat_id);

