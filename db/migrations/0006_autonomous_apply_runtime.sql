CREATE TABLE IF NOT EXISTS profile_snapshots (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_family text NOT NULL
    CHECK (schema_family IN ('workday', 'greenhouse', 'stripe')),
  profile_version integer NOT NULL DEFAULT 1
    CHECK (profile_version >= 1),
  snapshot_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profile_snapshots_user_created_idx
  ON profile_snapshots (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS apply_runs (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  job_posting_url text NOT NULL,
  company_name text NOT NULL,
  job_title text NOT NULL,
  ats_family text
    CHECK (
      ats_family IS NULL OR
      ats_family IN ('workday', 'greenhouse', 'lever', 'generic_hosted_form', 'unsupported_target')
    ),
  adapter_id text,
  profile_snapshot_id text NOT NULL REFERENCES profile_snapshots(id) ON DELETE RESTRICT,
  status text NOT NULL
    CHECK (status IN (
      'created',
      'queued',
      'preflight_validating',
      'preflight_failed',
      'snapshot_created',
      'detecting_target',
      'selecting_adapter',
      'launching_browser',
      'auth_required',
      'filling_form',
      'uploading_documents',
      'navigating_steps',
      'submitting',
      'submitted',
      'submission_unconfirmed',
      'failed',
      'needs_attention',
      'completed'
    )),
  terminal_state text
    CHECK (
      terminal_state IS NULL OR
      terminal_state IN ('submitted', 'failed', 'needs_attention', 'submission_unconfirmed')
    ),
  failure_code text
    CHECK (
      failure_code IS NULL OR
      failure_code IN (
        'PROFILE_INCOMPLETE',
        'UNSUPPORTED_TARGET',
        'ATS_DETECTION_FAILED',
        'LOGIN_REQUIRED',
        'CAPTCHA_ENCOUNTERED',
        'REQUIRED_FIELD_UNMAPPED',
        'REQUIRED_DOCUMENT_MISSING',
        'FILE_UPLOAD_FAILED',
        'FORM_STRUCTURE_CHANGED',
        'SUBMIT_BLOCKED',
        'SUBMISSION_NOT_CONFIRMED',
        'NETWORK_FAILURE',
        'TIMEOUT',
        'UNKNOWN_RUNTIME_ERROR'
      )
    ),
  failure_message text,
  attempt_count integer NOT NULL DEFAULT 1
    CHECK (attempt_count >= 1),
  trace_id text,
  feature_flag_name text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apply_runs_user_created_idx
  ON apply_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS apply_runs_status_created_idx
  ON apply_runs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS apply_runs_job_idx
  ON apply_runs (job_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS apply_runs_active_unique_idx
  ON apply_runs (user_id, job_id, job_posting_url)
  WHERE status IN (
    'created',
    'queued',
    'preflight_validating',
    'snapshot_created',
    'detecting_target',
    'selecting_adapter',
    'launching_browser',
    'auth_required',
    'filling_form',
    'uploading_documents',
    'navigating_steps',
    'submitting'
  );

CREATE TABLE IF NOT EXISTS apply_run_events (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES apply_runs(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL DEFAULT NOW(),
  state text NOT NULL
    CHECK (state IN (
      'created',
      'queued',
      'preflight_validating',
      'preflight_failed',
      'snapshot_created',
      'detecting_target',
      'selecting_adapter',
      'launching_browser',
      'auth_required',
      'filling_form',
      'uploading_documents',
      'navigating_steps',
      'submitting',
      'submitted',
      'submission_unconfirmed',
      'failed',
      'needs_attention',
      'completed'
    )),
  step_name text,
  event_type text NOT NULL,
  message text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS apply_run_events_run_timestamp_idx
  ON apply_run_events (run_id, timestamp ASC);

CREATE TABLE IF NOT EXISTS apply_run_artifacts (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES apply_runs(id) ON DELETE CASCADE,
  artifact_type text NOT NULL
    CHECK (artifact_type IN (
      'screenshot_initial',
      'screenshot_before_submit',
      'screenshot_after_submit',
      'screenshot_failure',
      'dom_snapshot',
      'trace_export',
      'document_reference',
      'json_debug'
    )),
  storage_key text NOT NULL,
  content_type text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apply_run_artifacts_run_created_idx
  ON apply_run_artifacts (run_id, created_at ASC);
