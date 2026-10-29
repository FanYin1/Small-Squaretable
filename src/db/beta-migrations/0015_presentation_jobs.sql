CREATE TABLE presentation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_revision text NOT NULL CHECK (source_revision ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatching','received','complete','skipped','cancelled','stale','unknown','failed')),
  dispatch_id uuid,
  dispatch_until timestamptz,
  draft jsonb,
  usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('dispatching','unknown') OR (dispatch_id IS NOT NULL AND dispatch_until IS NOT NULL)),
  CHECK (status NOT IN ('received','complete') OR (draft IS NOT NULL AND usage IS NOT NULL AND dispatch_id IS NOT NULL))
);
CREATE UNIQUE INDEX presentation_job_source ON presentation_jobs(character_id, source_revision);
CREATE INDEX presentation_job_pending ON presentation_jobs(status, created_at);
