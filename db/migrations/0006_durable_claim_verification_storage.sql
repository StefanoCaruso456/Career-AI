CREATE TABLE IF NOT EXISTS claims (
  id text PRIMARY KEY,
  soul_record_id text NOT NULL REFERENCES soul_records(id) ON DELETE CASCADE,
  claim_type text NOT NULL
    CHECK (claim_type IN ('EMPLOYMENT', 'EDUCATION', 'CERTIFICATION', 'ENDORSEMENT')),
  title text NOT NULL,
  summary text NOT NULL,
  self_reported_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_verification_record_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS claims_soul_record_idx
  ON claims (soul_record_id, created_at ASC);

CREATE INDEX IF NOT EXISTS claims_current_verification_idx
  ON claims (current_verification_record_id);

CREATE TABLE IF NOT EXISTS employment_records (
  id text PRIMARY KEY,
  claim_id text NOT NULL UNIQUE REFERENCES claims(id) ON DELETE CASCADE,
  employer_name text NOT NULL,
  employer_domain_optional text,
  role_title text NOT NULL,
  employment_type_optional text,
  start_date text NOT NULL,
  end_date_optional text,
  currently_employed boolean NOT NULL DEFAULT false,
  location_optional text,
  signatory_name_optional text,
  signatory_title_optional text,
  company_letterhead_detected_optional boolean,
  document_date_optional text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS employment_records_claim_idx
  ON employment_records (claim_id);

CREATE TABLE IF NOT EXISTS verification_records (
  id text PRIMARY KEY,
  claim_id text NOT NULL UNIQUE REFERENCES claims(id) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (
      status IN (
        'NOT_SUBMITTED',
        'SUBMITTED',
        'PARSING',
        'PARSED',
        'PENDING_REVIEW',
        'PARTIALLY_VERIFIED',
        'REVIEWED',
        'SOURCE_VERIFIED',
        'MULTI_SOURCE_VERIFIED',
        'EXPIRED',
        'REJECTED',
        'NEEDS_RESUBMISSION'
      )
    ),
  confidence_tier text NOT NULL
    CHECK (
      confidence_tier IN (
        'SELF_REPORTED',
        'EVIDENCE_SUBMITTED',
        'REVIEWED',
        'SOURCE_CONFIRMED',
        'MULTI_SOURCE_CONFIRMED'
      )
    ),
  primary_method text NOT NULL
    CHECK (
      primary_method IN (
        'USER_UPLOAD',
        'INTERNAL_REVIEW',
        'EMPLOYER_AGENT',
        'INSTITUTION_AGENT',
        'AUTHORIZED_HUMAN',
        'PUBLIC_REGISTRY',
        'ENDORSEMENT_SUBMISSION',
        'SYSTEM_RULE_MATCH'
      )
    ),
  source_label text NOT NULL,
  source_reference_optional text,
  reviewer_actor_id_optional text,
  reviewed_at_optional timestamptz,
  expires_at_optional timestamptz,
  notes_optional text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS verification_records_claim_idx
  ON verification_records (claim_id);

CREATE INDEX IF NOT EXISTS verification_records_status_idx
  ON verification_records (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS verification_provenance_records (
  id text PRIMARY KEY,
  verification_record_id text NOT NULL REFERENCES verification_records(id) ON DELETE CASCADE,
  artifact_id_optional text,
  source_actor_type text NOT NULL,
  source_actor_id_optional text,
  source_method text NOT NULL
    CHECK (
      source_method IN (
        'USER_UPLOAD',
        'INTERNAL_REVIEW',
        'EMPLOYER_AGENT',
        'INSTITUTION_AGENT',
        'AUTHORIZED_HUMAN',
        'PUBLIC_REGISTRY',
        'ENDORSEMENT_SUBMISSION',
        'SYSTEM_RULE_MATCH'
      )
    ),
  source_details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS verification_provenance_records_verification_idx
  ON verification_provenance_records (verification_record_id, created_at ASC);

ALTER TABLE claims
  ADD CONSTRAINT claims_current_verification_fk
  FOREIGN KEY (current_verification_record_id)
  REFERENCES verification_records(id)
  ON DELETE SET NULL;
