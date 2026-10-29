ALTER TABLE chats ADD COLUMN worldbook_snapshot_version integer
  CHECK (worldbook_snapshot_version IS NULL OR worldbook_snapshot_version = 1);
CREATE TABLE story_worldbooks (
  chat_id uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object')
);
CREATE FUNCTION preserve_story_worldbooks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Story worldbook snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER story_worldbooks_immutable BEFORE UPDATE ON story_worldbooks
  FOR EACH ROW EXECUTE FUNCTION preserve_story_worldbooks();
CREATE FUNCTION preserve_worldbook_snapshot_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.worldbook_snapshot_version IS DISTINCT FROM OLD.worldbook_snapshot_version THEN
    RAISE EXCEPTION 'Worldbook snapshot version is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chats_worldbook_snapshot_version_immutable BEFORE UPDATE ON chats
  FOR EACH ROW EXECUTE FUNCTION preserve_worldbook_snapshot_version();
