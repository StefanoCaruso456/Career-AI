ALTER TABLE career_identities
ADD COLUMN IF NOT EXISTS application_profiles_json jsonb NOT NULL DEFAULT '{}'::jsonb;
