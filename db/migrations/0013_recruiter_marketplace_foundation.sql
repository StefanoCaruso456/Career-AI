CREATE TABLE IF NOT EXISTS employer_partners (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  legal_name text,
  website_url text,
  logo_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employer_partners_status_idx
  ON employer_partners (status, display_name);

CREATE TABLE IF NOT EXISTS recruiter_career_identities (
  id text PRIMARY KEY,
  agent_id text NOT NULL UNIQUE,
  employer_partner_id text NOT NULL REFERENCES employer_partners(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  recruiter_role_title text NOT NULL,
  bio text NOT NULL,
  company_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  visibility text NOT NULL DEFAULT 'public_directory'
    CHECK (visibility IN ('public_directory', 'private_directory')),
  synthetic boolean NOT NULL DEFAULT false,
  avatar_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ownership_scope_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiter_career_identities_employer_idx
  ON recruiter_career_identities (employer_partner_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_career_identities_visibility_idx
  ON recruiter_career_identities (visibility, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS recruiter_owned_jobs (
  id text PRIMARY KEY,
  recruiter_career_identity_id text NOT NULL REFERENCES recruiter_career_identities(id) ON DELETE CASCADE,
  employer_partner_id text NOT NULL REFERENCES employer_partners(id) ON DELETE CASCADE,
  title text NOT NULL,
  location text,
  department text,
  employment_type text,
  seniority text,
  compensation_min numeric(12, 2),
  compensation_max numeric(12, 2),
  compensation_currency text,
  description text NOT NULL,
  responsibilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualifications_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  preferred_qualifications_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'on_hold', 'closed')),
  visibility text NOT NULL DEFAULT 'discoverable'
    CHECK (visibility IN ('discoverable', 'restricted')),
  searchable_text text NOT NULL DEFAULT '',
  retrieval_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiter_owned_jobs_recruiter_idx
  ON recruiter_owned_jobs (recruiter_career_identity_id, status, visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_owned_jobs_employer_idx
  ON recruiter_owned_jobs (employer_partner_id, status, visibility, updated_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_owned_jobs_filter_idx
  ON recruiter_owned_jobs (status, visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_owned_jobs_searchable_text_idx
  ON recruiter_owned_jobs (searchable_text);

CREATE TABLE IF NOT EXISTS recruiter_access_grants (
  id text PRIMARY KEY,
  recruiter_career_identity_id text NOT NULL REFERENCES recruiter_career_identities(id) ON DELETE CASCADE,
  employer_partner_id text NOT NULL REFERENCES employer_partners(id) ON DELETE CASCADE,
  job_seeker_career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT NOW(),
  approved_at timestamptz,
  denied_at timestamptz,
  revoked_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'revoked')),
  granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
  expires_at timestamptz,
  created_by_actor_type text NOT NULL
    CHECK (created_by_actor_type IN ('talent_user', 'recruiter_user', 'hiring_manager_user', 'reviewer_admin', 'system_service')),
  created_by_actor_id text NOT NULL,
  approval_source text NOT NULL DEFAULT 'policy_auto_approve',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiter_access_grants_recruiter_seeker_status_idx
  ON recruiter_access_grants (
    recruiter_career_identity_id,
    job_seeker_career_identity_id,
    status,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS recruiter_access_grants_seeker_recruiter_status_idx
  ON recruiter_access_grants (
    job_seeker_career_identity_id,
    recruiter_career_identity_id,
    status,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS recruiter_access_grants_employer_status_idx
  ON recruiter_access_grants (employer_partner_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS recruiter_access_grants_unique_active_request_idx
  ON recruiter_access_grants (recruiter_career_identity_id, job_seeker_career_identity_id)
  WHERE status IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS recruiter_conversations (
  id text PRIMARY KEY,
  recruiter_career_identity_id text NOT NULL REFERENCES recruiter_career_identities(id) ON DELETE CASCADE,
  job_seeker_career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (recruiter_career_identity_id, job_seeker_career_identity_id)
);

CREATE INDEX IF NOT EXISTS recruiter_conversations_seeker_recruiter_idx
  ON recruiter_conversations (job_seeker_career_identity_id, recruiter_career_identity_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS recruiter_conversation_messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES recruiter_conversations(id) ON DELETE CASCADE,
  recruiter_career_identity_id text NOT NULL REFERENCES recruiter_career_identities(id) ON DELETE CASCADE,
  job_seeker_career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  sender_role text NOT NULL
    CHECK (sender_role IN ('job_seeker', 'recruiter_agent', 'system')),
  content text NOT NULL,
  citations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrieval_mode text
    CHECK (retrieval_mode IS NULL OR retrieval_mode IN ('recruiter_jobs', 'recruiter_match', 'recruiter_review')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiter_conversation_messages_conversation_idx
  ON recruiter_conversation_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS recruiter_conversation_messages_recruiter_seeker_idx
  ON recruiter_conversation_messages (
    recruiter_career_identity_id,
    job_seeker_career_identity_id,
    created_at DESC
  );

CREATE TABLE IF NOT EXISTS synthetic_data_seed_runs (
  id text PRIMARY KEY,
  seed_key text NOT NULL,
  seed_version text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count integer NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS synthetic_data_seed_runs_key_version_idx
  ON synthetic_data_seed_runs (seed_key, seed_version, started_at DESC);

CREATE TABLE IF NOT EXISTS recruiter_protocol_events (
  id text PRIMARY KEY,
  message_type text NOT NULL
    CHECK (
      message_type IN (
        'recruiter_access_request',
        'recruiter_access_approved',
        'recruiter_access_denied',
        'recruiter_fit_evaluation_request',
        'seeker_authorized_career_id_share',
        'recruiter_recommendation_response',
        'recruiter_review_request',
        'recruiter_conversation_follow_up'
      )
    ),
  sender_agent_id text NOT NULL,
  receiver_agent_id text NOT NULL,
  recruiter_career_identity_id text NOT NULL REFERENCES recruiter_career_identities(id) ON DELETE CASCADE,
  seeker_career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  access_grant_id text REFERENCES recruiter_access_grants(id) ON DELETE SET NULL,
  request_id text,
  run_id text,
  lifecycle_state text NOT NULL,
  success boolean NOT NULL DEFAULT true,
  failure_reason text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruiter_protocol_events_recruiter_idx
  ON recruiter_protocol_events (recruiter_career_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_protocol_events_seeker_idx
  ON recruiter_protocol_events (seeker_career_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recruiter_protocol_events_request_idx
  ON recruiter_protocol_events (request_id, created_at ASC);
