ALTER TABLE chats ADD COLUMN content_snapshot_version integer CHECK (content_snapshot_version IS NULL OR content_snapshot_version = 1);
--> statement-breakpoint
CREATE TABLE story_content (chat_id uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE, snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'));
--> statement-breakpoint
CREATE FUNCTION preserve_story_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Story content snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER story_content_immutable BEFORE UPDATE ON story_content FOR EACH ROW EXECUTE FUNCTION preserve_story_content();
--> statement-breakpoint
CREATE FUNCTION preserve_content_snapshot_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_snapshot_version IS DISTINCT FROM OLD.content_snapshot_version THEN
    RAISE EXCEPTION 'Content snapshot version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER chats_content_snapshot_version_immutable BEFORE UPDATE ON chats FOR EACH ROW EXECUTE FUNCTION preserve_content_snapshot_version();
