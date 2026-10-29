CREATE TABLE story_memory_progress (
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  event_ids uuid[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (chat_id, character_id),
  CHECK (cardinality(event_ids) < 5)
);

CREATE TABLE story_memory_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  source_event_ids uuid[] NOT NULL CHECK (cardinality(source_event_ids) = 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'retry', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  extracted jsonb,
  source_digest text,
  error_code text,
  replay_history jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(replay_history) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT story_memory_jobs_source_key UNIQUE (chat_id, character_id, source_event_ids)
);
CREATE INDEX story_memory_jobs_available ON story_memory_jobs (available_at) WHERE status IN ('pending', 'retry', 'running');

ALTER TABLE character_memories ALTER COLUMN source_message_id TYPE bigint;
CREATE TABLE story_memory_links (
  memory_id uuid NOT NULL REFERENCES character_memories(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES story_memory_jobs(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES story_events(id) ON DELETE CASCADE,
  message_id bigint NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, event_id, message_id)
);

CREATE INDEX story_memory_links_job ON story_memory_links (job_id);
CREATE INDEX story_memory_links_event ON story_memory_links (event_id);
CREATE INDEX story_memory_links_message ON story_memory_links (message_id);

CREATE FUNCTION enqueue_story_memory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_character uuid;
  pending_ids uuid[];
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  SELECT COALESCE(message.character_id, chat.character_id) INTO target_character
    FROM chats chat JOIN messages message ON message.id = NEW.message_id AND message.chat_id = chat.id
    WHERE chat.id = NEW.chat_id AND chat.content_snapshot_version = 1 AND message.role = 'assistant';
  IF target_character IS NULL THEN RETURN NEW; END IF;
  INSERT INTO story_memory_progress (chat_id, character_id) VALUES (NEW.chat_id, target_character)
    ON CONFLICT DO NOTHING;
  SELECT event_ids || NEW.id INTO pending_ids FROM story_memory_progress
    WHERE chat_id = NEW.chat_id AND character_id = target_character FOR UPDATE;
  IF cardinality(pending_ids) = 5 THEN
    INSERT INTO story_memory_jobs (chat_id, character_id, source_event_ids)
      VALUES (NEW.chat_id, target_character, pending_ids);
    pending_ids := '{}';
  END IF;
  UPDATE story_memory_progress SET event_ids = pending_ids
    WHERE chat_id = NEW.chat_id AND character_id = target_character;
  RETURN NEW;
END;
$$;
CREATE TRIGGER story_memory_enqueue AFTER INSERT ON story_events FOR EACH ROW EXECUTE FUNCTION enqueue_story_memory();
