CREATE TABLE IF NOT EXISTS job_sources (
  source_key text PRIMARY KEY,
  source_label text NOT NULL,
  source_lane text NOT NULL
    CHECK (source_lane IN ('ats_direct', 'aggregator')),
  source_quality text NOT NULL
    CHECK (source_quality IN ('high_signal', 'coverage')),
  status text NOT NULL
    CHECK (status IN ('connected', 'degraded', 'not_configured')),
  endpoint_label text,
  message text NOT NULL,
  job_count integer NOT NULL DEFAULT 0
    CHECK (job_count >= 0),
  last_synced_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_sources_lane_idx
  ON job_sources (source_lane, source_quality, source_label);

CREATE INDEX IF NOT EXISTS job_sources_last_synced_at_idx
  ON job_sources (last_synced_at DESC);

CREATE TABLE IF NOT EXISTS job_postings (
  id text PRIMARY KEY,
  external_id text NOT NULL,
  title text NOT NULL,
  company_name text NOT NULL,
  location text,
  department text,
  commitment text,
  source_key text NOT NULL REFERENCES job_sources(source_key) ON DELETE CASCADE,
  source_label text NOT NULL,
  source_lane text NOT NULL
    CHECK (source_lane IN ('ats_direct', 'aggregator')),
  source_quality text NOT NULL
    CHECK (source_quality IN ('high_signal', 'coverage')),
  apply_url text NOT NULL,
  dedupe_key text NOT NULL,
  posted_at timestamptz,
  updated_at timestamptz,
  description_snippet text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  persisted_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_postings_source_key_idx
  ON job_postings (source_key, is_active);

CREATE INDEX IF NOT EXISTS job_postings_active_sort_idx
  ON job_postings (is_active, source_quality, updated_at DESC, posted_at DESC);

CREATE INDEX IF NOT EXISTS job_postings_dedupe_key_idx
  ON job_postings (dedupe_key);
