ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS revoked_by_actor_type text;

ALTER TABLE access_grants
  ADD COLUMN IF NOT EXISTS revoked_by_actor_id text;

CREATE INDEX IF NOT EXISTS access_grants_subject_status_updated_idx
  ON access_grants (subject_talent_identity_id, status, updated_at DESC);
