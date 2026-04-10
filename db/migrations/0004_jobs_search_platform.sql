ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS external_source_job_id text,
  ADD COLUMN IF NOT EXISTS normalized_title text,
  ADD COLUMN IF NOT EXISTS normalized_company_name text,
  ADD COLUMN IF NOT EXISTS workplace_type text
    CHECK (workplace_type IN ('remote', 'hybrid', 'onsite', 'unknown')),
  ADD COLUMN IF NOT EXISTS salary_text text,
  ADD COLUMN IF NOT EXISTS source_trust_tier text
    CHECK (source_trust_tier IN ('trusted_direct', 'trusted_aggregator', 'coverage', 'unknown')),
  ADD COLUMN IF NOT EXISTS canonical_apply_url text,
  ADD COLUMN IF NOT EXISTS canonical_job_url text,
  ADD COLUMN IF NOT EXISTS raw_payload_json jsonb,
  ADD COLUMN IF NOT EXISTS ingested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_status text
    CHECK (
      validation_status IN (
        'active_verified',
        'active_unverified',
        'stale',
        'duplicate',
        'expired',
        'invalid',
        'blocked_source'
      )
    ),
  ADD COLUMN IF NOT EXISTS trust_score numeric(4,3),
  ADD COLUMN IF NOT EXISTS dedupe_fingerprint text,
  ADD COLUMN IF NOT EXISTS orchestration_readiness boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS application_path_type text
    CHECK (
      application_path_type IN (
        'ats_hosted',
        'company_careers',
        'aggregator_redirect',
        'external_redirect',
        'unknown'
      )
    ),
  ADD COLUMN IF NOT EXISTS redirect_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orchestration_metadata_json jsonb;

UPDATE job_postings
SET
  external_source_job_id = COALESCE(external_source_job_id, external_id),
  normalized_title = COALESCE(normalized_title, lower(title)),
  normalized_company_name = COALESCE(normalized_company_name, lower(company_name)),
  workplace_type = COALESCE(
    workplace_type,
    CASE
      WHEN location IS NULL THEN 'unknown'
      WHEN lower(location) LIKE '%remote%' THEN 'remote'
      WHEN lower(location) LIKE '%hybrid%' THEN 'hybrid'
      ELSE 'onsite'
    END
  ),
  salary_text = salary_text,
  source_trust_tier = COALESCE(
    source_trust_tier,
    CASE
      WHEN source_lane = 'ats_direct' THEN 'trusted_direct'
      WHEN source_quality = 'high_signal' THEN 'trusted_aggregator'
      ELSE 'coverage'
    END
  ),
  canonical_apply_url = COALESCE(canonical_apply_url, apply_url),
  ingested_at = COALESCE(ingested_at, persisted_at, created_at, NOW()),
  last_validated_at = COALESCE(last_validated_at, persisted_at, NOW()),
  validation_status = COALESCE(
    validation_status,
    CASE
      WHEN source_lane = 'ats_direct' THEN 'active_verified'
      ELSE 'active_unverified'
    END
  ),
  trust_score = COALESCE(
    trust_score,
    CASE
      WHEN source_lane = 'ats_direct' THEN 0.900
      WHEN source_quality = 'high_signal' THEN 0.760
      ELSE 0.620
    END
  ),
  dedupe_fingerprint = COALESCE(dedupe_fingerprint, dedupe_key),
  application_path_type = COALESCE(
    application_path_type,
    CASE
      WHEN lower(apply_url) LIKE '%greenhouse%' THEN 'ats_hosted'
      WHEN lower(apply_url) LIKE '%lever.co%' THEN 'ats_hosted'
      WHEN lower(apply_url) LIKE '%ashbyhq%' THEN 'ats_hosted'
      WHEN lower(apply_url) LIKE '%workdayjobs%' THEN 'ats_hosted'
      WHEN lower(apply_url) LIKE '%workable%' THEN 'ats_hosted'
      WHEN source_lane = 'aggregator' THEN 'aggregator_redirect'
      ELSE 'company_careers'
    END
  ),
  orchestration_metadata_json = COALESCE(orchestration_metadata_json, '{}'::jsonb);

CREATE INDEX IF NOT EXISTS job_postings_validation_sort_idx
  ON job_postings (is_active, validation_status, trust_score DESC, updated_at DESC, posted_at DESC);

CREATE INDEX IF NOT EXISTS job_postings_company_title_idx
  ON job_postings (normalized_company_name, normalized_title);

CREATE INDEX IF NOT EXISTS job_postings_orchestration_idx
  ON job_postings (orchestration_readiness, application_path_type);

CREATE TABLE IF NOT EXISTS job_validation_events (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  validation_status text NOT NULL
    CHECK (
      validation_status IN (
        'active_verified',
        'active_unverified',
        'stale',
        'duplicate',
        'expired',
        'invalid',
        'blocked_source'
      )
    ),
  source_trust_tier text NOT NULL
    CHECK (source_trust_tier IN ('trusted_direct', 'trusted_aggregator', 'coverage', 'unknown')),
  trust_score numeric(4,3) NOT NULL,
  reason_codes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_validation_events_job_idx
  ON job_validation_events (job_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS job_search_events (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  conversation_id text,
  origin text NOT NULL
    CHECK (origin IN ('chat_prompt', 'panel_refresh', 'cta', 'api')),
  prompt text NOT NULL,
  normalized_prompt text NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  used_career_id_defaults boolean NOT NULL DEFAULT false,
  career_id_signals_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_count integer NOT NULL DEFAULT 0
    CHECK (result_count >= 0),
  result_job_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  latency_ms integer NOT NULL DEFAULT 0
    CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_search_events_owner_idx
  ON job_search_events (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_search_events_prompt_idx
  ON job_search_events (normalized_prompt, created_at DESC);

CREATE TABLE IF NOT EXISTS job_apply_click_events (
  id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  owner_id text NOT NULL,
  conversation_id text,
  canonical_apply_url text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_apply_click_events_job_idx
  ON job_apply_click_events (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_apply_click_events_owner_idx
  ON job_apply_click_events (owner_id, created_at DESC);
