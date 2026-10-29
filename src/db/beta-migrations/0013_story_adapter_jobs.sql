CREATE TABLE story_adapter_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  source_revision text NOT NULL CHECK (source_revision ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed','cancelled','stale')),
  stage text NOT NULL DEFAULT 'collect' CHECK (stage IN ('collect','inspect','compile','complete')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0 AND attempt <= 3),
  lease_id uuid, lease_until timestamptz, artifact jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'ready') = (artifact IS NOT NULL)),
  CHECK ((status = 'running') = (lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE UNIQUE INDEX story_adapter_request_key ON story_adapter_jobs(character_id,user_id,request_id);
CREATE INDEX story_adapter_pending ON story_adapter_jobs(status,lease_until);
CREATE INDEX story_adapter_versions ON story_adapter_jobs(character_id,created_at);
