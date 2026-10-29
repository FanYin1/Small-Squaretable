CREATE TABLE character_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  source_revision text NOT NULL CHECK (source_revision ~ '^[a-f0-9]{64}$'),
  draft jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (draft->>'characterId' = character_id::text),
  CHECK (draft->>'sourceRevision' = source_revision)
);
CREATE UNIQUE INDEX character_presentation_request ON character_presentations(character_id,user_id,request_id);
CREATE INDEX character_presentation_versions ON character_presentations(character_id,source_revision,created_at);
