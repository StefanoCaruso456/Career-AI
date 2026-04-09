CREATE SEQUENCE IF NOT EXISTS career_identity_talent_agent_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  image_url text,
  auth_provider text NOT NULL,
  provider_user_id text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  last_login_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_provider_identity_key
  ON users (auth_provider, provider_user_id);

CREATE INDEX IF NOT EXISTS users_provider_user_id_idx
  ON users (provider_user_id);

CREATE INDEX IF NOT EXISTS users_last_login_at_idx
  ON users (last_login_at DESC);

CREATE TABLE IF NOT EXISTS career_identities (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  talent_agent_id text NOT NULL UNIQUE,
  onboarding_status text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed')),
  profile_completion_percent integer NOT NULL DEFAULT 0
    CHECK (profile_completion_percent >= 0 AND profile_completion_percent <= 100),
  current_step integer NOT NULL DEFAULT 1
    CHECK (current_step >= 1 AND current_step <= 4),
  role_type text,
  display_name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'ZZ',
  phone_optional text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS career_identities_user_id_idx
  ON career_identities (user_id);

CREATE INDEX IF NOT EXISTS career_identities_onboarding_status_idx
  ON career_identities (onboarding_status);

CREATE TABLE IF NOT EXISTS privacy_settings (
  id text PRIMARY KEY,
  career_identity_id text NOT NULL UNIQUE REFERENCES career_identities(id) ON DELETE CASCADE,
  show_employment_records boolean NOT NULL DEFAULT false,
  show_education_records boolean NOT NULL DEFAULT false,
  show_certification_records boolean NOT NULL DEFAULT false,
  show_endorsements boolean NOT NULL DEFAULT false,
  show_status_labels boolean NOT NULL DEFAULT true,
  show_artifact_previews boolean NOT NULL DEFAULT false,
  allow_public_share_link boolean NOT NULL DEFAULT false,
  allow_qr_share boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS privacy_settings_identity_idx
  ON privacy_settings (career_identity_id);

CREATE TABLE IF NOT EXISTS soul_records (
  id text PRIMARY KEY,
  career_identity_id text NOT NULL UNIQUE REFERENCES career_identities(id) ON DELETE CASCADE,
  trust_summary_id text,
  default_share_profile_id text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS soul_records_identity_idx
  ON soul_records (career_identity_id);
