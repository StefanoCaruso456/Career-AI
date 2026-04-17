CREATE TABLE IF NOT EXISTS career_id_verifications (
  id text PRIMARY KEY,
  career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  phase text NOT NULL
    CHECK (
      phase IN (
        'self_reported',
        'relationship_backed',
        'document_backed',
        'signature_backed',
        'institution_verified'
      )
    ),
  type text NOT NULL
    CHECK (type IN ('government_id')),
  provider text NOT NULL
    CHECK (provider IN ('persona')),
  provider_reference_hash text NOT NULL UNIQUE,
  provider_reference_encrypted text NOT NULL,
  status text NOT NULL
    CHECK (
      status IN (
        'locked',
        'not_started',
        'in_progress',
        'verified',
        'retry_needed',
        'manual_review',
        'failed'
      )
    ),
  confidence_band text
    CHECK (confidence_band IS NULL OR confidence_band IN ('low', 'medium', 'high')),
  checks_json jsonb NOT NULL DEFAULT '{"documentAuthenticity":"unknown","liveness":"unknown","faceMatch":"unknown"}'::jsonb,
  manual_review_required boolean NOT NULL DEFAULT false,
  latest_event_id text,
  latest_event_created_at timestamptz,
  latest_payload_hash text,
  attempt_number integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'career_id_page',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS career_id_verifications_identity_idx
  ON career_id_verifications (career_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS career_id_verifications_status_idx
  ON career_id_verifications (career_identity_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS career_id_evidence (
  id text PRIMARY KEY,
  career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  phase text NOT NULL
    CHECK (
      phase IN (
        'self_reported',
        'relationship_backed',
        'document_backed',
        'signature_backed',
        'institution_verified'
      )
    ),
  label text NOT NULL,
  type text NOT NULL
    CHECK (
      type IN (
        'government_id',
        'selfie_liveness',
        'diploma',
        'certification',
        'transcript',
        'endorsement',
        'reference_letter',
        'signed_letter',
        'institution_check'
      )
    ),
  provider text
    CHECK (provider IS NULL OR provider IN ('persona', 'internal')),
  provider_reference_hash text,
  provider_reference_encrypted text,
  status text NOT NULL
    CHECK (
      status IN (
        'locked',
        'not_started',
        'in_progress',
        'verified',
        'retry_needed',
        'manual_review',
        'failed'
      )
    ),
  confidence_band text
    CHECK (confidence_band IS NULL OR confidence_band IN ('low', 'medium', 'high')),
  manual_review_required boolean NOT NULL DEFAULT false,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz,
  UNIQUE (career_identity_id, type)
);

CREATE INDEX IF NOT EXISTS career_id_evidence_identity_idx
  ON career_id_evidence (career_identity_id, phase, updated_at DESC);

CREATE TABLE IF NOT EXISTS career_id_audit_events (
  id text PRIMARY KEY,
  career_identity_id text NOT NULL REFERENCES career_identities(id) ON DELETE CASCADE,
  verification_id text REFERENCES career_id_verifications(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  provider text,
  provider_event_id text,
  payload_hash text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS career_id_audit_events_identity_idx
  ON career_id_audit_events (career_identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS career_id_audit_events_verification_idx
  ON career_id_audit_events (verification_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS career_id_audit_events_provider_event_idx
  ON career_id_audit_events (provider, provider_event_id);
