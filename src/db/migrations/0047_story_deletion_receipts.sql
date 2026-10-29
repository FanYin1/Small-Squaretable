CREATE TABLE story_restore_lineage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO story_restore_lineage (singleton) VALUES (true);

CREATE TABLE story_id_reservations (
  chat_id uuid PRIMARY KEY
);
INSERT INTO story_id_reservations (chat_id) SELECT id FROM chats;

CREATE TABLE story_deletions (
  chat_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  creation_requests jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(creation_requests) = 'array')
);

CREATE FUNCTION preserve_story_deletion_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Story deletion evidence cannot be changed or removed' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER story_deletions_immutable BEFORE UPDATE OR DELETE ON story_deletions
  FOR EACH ROW EXECUTE FUNCTION preserve_story_deletion_evidence();
CREATE TRIGGER story_deletions_no_truncate BEFORE TRUNCATE ON story_deletions
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_story_deletion_evidence();
CREATE TRIGGER story_reservations_immutable BEFORE UPDATE OR DELETE ON story_id_reservations
  FOR EACH ROW EXECUTE FUNCTION preserve_story_deletion_evidence();
CREATE TRIGGER story_reservations_no_truncate BEFORE TRUNCATE ON story_id_reservations
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_story_deletion_evidence();
CREATE TRIGGER story_lineage_immutable BEFORE UPDATE OR DELETE ON story_restore_lineage
  FOR EACH ROW EXECUTE FUNCTION preserve_story_deletion_evidence();
CREATE TRIGGER story_lineage_no_truncate BEFORE TRUNCATE ON story_restore_lineage
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_story_deletion_evidence();
CREATE TRIGGER chats_no_untracked_truncate BEFORE TRUNCATE ON chats
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_story_deletion_evidence();

CREATE FUNCTION reserve_story_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO story_id_reservations (chat_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER chats_reserve_id AFTER INSERT ON chats FOR EACH ROW EXECUTE FUNCTION reserve_story_id();

CREATE FUNCTION preserve_story_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Story IDs cannot be reassigned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER chats_preserve_id BEFORE UPDATE OF id ON chats FOR EACH ROW EXECUTE FUNCTION preserve_story_id();

CREATE FUNCTION record_story_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO story_deletions (chat_id, tenant_id, user_id, creation_requests)
  SELECT OLD.id, OLD.tenant_id, OLD.user_id,
    COALESCE(jsonb_agg(jsonb_build_object('id', id, 'requestId', request_id,
      'payloadHash', payload_hash, 'createdAt', created_at) ORDER BY id), '[]'::jsonb)
  FROM chat_creation_requests WHERE chat_id = OLD.id
  ON CONFLICT (chat_id) DO NOTHING;
  RETURN OLD;
END;
$$;
CREATE TRIGGER chats_record_deletion BEFORE DELETE ON chats FOR EACH ROW EXECUTE FUNCTION record_story_deletion();
