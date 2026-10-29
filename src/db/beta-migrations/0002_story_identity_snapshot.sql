ALTER TABLE chats ADD COLUMN identity_snapshot jsonb;
ALTER TABLE chats ADD CONSTRAINT chats_identity_snapshot_object
  CHECK (identity_snapshot IS NULL OR jsonb_typeof(identity_snapshot) = 'object');
CREATE FUNCTION preserve_story_identity_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.identity_snapshot IS DISTINCT FROM OLD.identity_snapshot THEN
    RAISE EXCEPTION 'Story identity snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chats_identity_snapshot_immutable BEFORE UPDATE ON chats
  FOR EACH ROW EXECUTE FUNCTION preserve_story_identity_snapshot();
