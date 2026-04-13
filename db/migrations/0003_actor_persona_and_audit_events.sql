ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_persona text;

CREATE INDEX IF NOT EXISTS users_preferred_persona_idx
  ON users (preferred_persona);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  actor_type text NOT NULL
    CHECK (actor_type IN ('talent_user', 'recruiter_user', 'hiring_manager_user', 'reviewer_admin', 'system_service')),
  actor_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  correlation_id text NOT NULL,
  run_id text,
  occurred_at timestamptz NOT NULL DEFAULT NOW(),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx
  ON audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_correlation_id_idx
  ON audit_events (correlation_id);

CREATE INDEX IF NOT EXISTS audit_events_target_idx
  ON audit_events (target_type, target_id);
