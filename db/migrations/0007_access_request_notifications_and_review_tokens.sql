CREATE TABLE IF NOT EXISTS candidate_notification_preferences (
  career_identity_id text PRIMARY KEY REFERENCES career_identities(id) ON DELETE CASCADE,
  access_request_email_enabled boolean NOT NULL DEFAULT true,
  access_request_sms_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS candidate_notification_preferences_sms_idx
  ON candidate_notification_preferences (access_request_sms_enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS access_request_review_tokens (
  id text PRIMARY KEY,
  access_request_id text NOT NULL REFERENCES access_requests(id) ON DELETE CASCADE,
  channel text NOT NULL
    CHECK (channel IN ('email', 'sms')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_viewed_at timestamptz,
  last_resolved_at timestamptz,
  invalidated_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_request_review_tokens_request_idx
  ON access_request_review_tokens (access_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS access_request_review_tokens_expiry_idx
  ON access_request_review_tokens (expires_at, invalidated_at);
