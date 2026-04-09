CREATE TABLE IF NOT EXISTS career_builder_profiles (
  career_identity_id text PRIMARY KEY REFERENCES career_identities(id) ON DELETE CASCADE,
  legal_name text NOT NULL DEFAULT '',
  career_headline text NOT NULL DEFAULT '',
  target_role text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  core_narrative text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS career_builder_profiles_updated_at_idx
  ON career_builder_profiles (updated_at DESC);

CREATE TABLE IF NOT EXISTS career_builder_evidence (
  id text PRIMARY KEY,
  career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  completion_tier text NOT NULL
    CHECK (completion_tier IN ('self', 'relationship', 'document', 'signature', 'institution')),
  source_or_issuer text NOT NULL DEFAULT '',
  issued_on date,
  validation_context text NOT NULL DEFAULT '',
  why_it_matters text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (career_identity_id, template_id)
);

CREATE INDEX IF NOT EXISTS career_builder_evidence_identity_idx
  ON career_builder_evidence (career_identity_id);

CREATE INDEX IF NOT EXISTS career_builder_evidence_tier_idx
  ON career_builder_evidence (career_identity_id, completion_tier);

CREATE TABLE IF NOT EXISTS career_builder_evidence_files (
  id text PRIMARY KEY,
  evidence_id text NOT NULL REFERENCES career_builder_evidence(id) ON DELETE CASCADE,
  artifact_id text NOT NULL,
  name text NOT NULL,
  size_label text NOT NULL,
  mime_type text NOT NULL,
  uploaded_at timestamptz NOT NULL,
  slot text
    CHECK (slot IS NULL OR slot IN ('front', 'back')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS career_builder_evidence_files_evidence_idx
  ON career_builder_evidence_files (evidence_id);

CREATE INDEX IF NOT EXISTS career_builder_evidence_files_artifact_idx
  ON career_builder_evidence_files (artifact_id);
