ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive'));

ALTER TABLE organization_memberships
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS organization_memberships_active_user_idx
  ON organization_memberships (user_id, status, organization_id);

CREATE TABLE IF NOT EXISTS access_requests (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requester_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_talent_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  scope text NOT NULL
    CHECK (scope IN ('candidate_private_profile')),
  justification text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'granted', 'rejected', 'cancelled')),
  granted_by_actor_type text,
  granted_by_actor_id text,
  rejected_by_actor_type text,
  rejected_by_actor_id text,
  granted_at timestamptz,
  rejected_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_requests_requester_idx
  ON access_requests (requester_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS access_requests_subject_idx
  ON access_requests (subject_talent_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS access_requests_org_status_idx
  ON access_requests (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS access_grants (
  id text PRIMARY KEY,
  access_request_id text REFERENCES access_requests(id) ON DELETE SET NULL,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_talent_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  scope text NOT NULL
    CHECK (scope IN ('candidate_private_profile')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  granted_by_actor_type text NOT NULL
    CHECK (granted_by_actor_type IN ('talent_user', 'recruiter_user', 'hiring_manager_user', 'reviewer_admin', 'system_service')),
  granted_by_actor_id text NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS access_grants_org_subject_scope_idx
  ON access_grants (organization_id, subject_talent_identity_id, scope, status);

CREATE INDEX IF NOT EXISTS access_grants_request_idx
  ON access_grants (access_request_id);
