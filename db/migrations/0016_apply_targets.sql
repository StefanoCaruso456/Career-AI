CREATE TABLE IF NOT EXISTS apply_targets (
  job_posting_id text PRIMARY KEY REFERENCES job_postings(id) ON DELETE CASCADE,
  canonical_apply_url text NOT NULL,
  ats_family text
    CHECK (
      ats_family IS NULL OR
      ats_family IN ('workday', 'greenhouse', 'lever', 'generic_hosted_form', 'unsupported_target')
    ),
  confidence numeric(4,3)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  matched_rule text,
  routing_mode text NOT NULL
    CHECK (routing_mode IN ('queue_autonomous_apply', 'open_external')),
  support_reason text,
  support_status text NOT NULL
    CHECK (support_status IN ('supported', 'unsupported', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apply_targets_support_status_idx
  ON apply_targets (support_status, routing_mode, updated_at DESC);

CREATE INDEX IF NOT EXISTS apply_targets_canonical_apply_url_idx
  ON apply_targets (canonical_apply_url);

INSERT INTO apply_targets (
  job_posting_id,
  canonical_apply_url,
  ats_family,
  confidence,
  matched_rule,
  routing_mode,
  support_reason,
  support_status
)
SELECT
  job_posting_id,
  canonical_apply_url,
  inferred_ats_family,
  CASE
    WHEN inferred_ats_family = 'workday' THEN 0.980
    WHEN inferred_ats_family IN ('greenhouse', 'lever') THEN 0.950
    WHEN inferred_ats_family = 'unsupported_target' THEN 0.150
    ELSE NULL
  END AS confidence,
  CASE
    WHEN canonical_apply_url IS NULL THEN 'missing_apply_url'
    WHEN inferred_ats_family = 'workday' THEN 'workday_url_or_dom_signature'
    WHEN inferred_ats_family = 'greenhouse' THEN 'greenhouse_url_signature'
    WHEN inferred_ats_family = 'lever' THEN 'lever_url_signature'
    ELSE 'no_known_signature'
  END AS matched_rule,
  CASE
    WHEN orchestration_readiness = true
      AND inferred_ats_family IN ('workday', 'greenhouse')
      THEN 'queue_autonomous_apply'
    ELSE 'open_external'
  END AS routing_mode,
  CASE
    WHEN canonical_apply_url IS NULL THEN 'missing_apply_url'
    WHEN orchestration_readiness = true
      AND inferred_ats_family IN ('workday', 'greenhouse')
      THEN 'supported_ats_family'
    WHEN inferred_ats_family = 'unsupported_target'
      THEN 'ats_detection_inconclusive'
    WHEN orchestration_readiness = true
      THEN 'unsupported_ats_family'
    ELSE 'job_not_ready_for_autonomous_apply'
  END AS support_reason,
  CASE
    WHEN orchestration_readiness = true
      AND inferred_ats_family IN ('workday', 'greenhouse')
      THEN 'supported'
    WHEN inferred_ats_family = 'unsupported_target'
      THEN 'unknown'
    ELSE 'unsupported'
  END AS support_status
FROM (
  SELECT
    id AS job_posting_id,
    COALESCE(canonical_apply_url, apply_url) AS canonical_apply_url,
    orchestration_readiness,
    CASE
      WHEN COALESCE(canonical_apply_url, apply_url) IS NULL THEN NULL
      WHEN lower(COALESCE(canonical_apply_url, apply_url)) LIKE '%myworkdayjobs%'
        OR lower(COALESCE(canonical_apply_url, apply_url)) LIKE '%myworkdaysite%'
        OR lower(COALESCE(canonical_apply_url, apply_url)) LIKE '%workdayjobs%'
        THEN 'workday'
      WHEN lower(COALESCE(canonical_apply_url, apply_url)) LIKE '%greenhouse%'
        THEN 'greenhouse'
      WHEN lower(COALESCE(canonical_apply_url, apply_url)) LIKE '%lever.co%'
        OR lower(COALESCE(canonical_apply_url, apply_url)) LIKE '%/lever%'
        THEN 'lever'
      ELSE 'unsupported_target'
    END AS inferred_ats_family
  FROM job_postings
) AS target_source
WHERE target_source.canonical_apply_url IS NOT NULL
ON CONFLICT (job_posting_id) DO UPDATE
SET
  canonical_apply_url = EXCLUDED.canonical_apply_url,
  ats_family = EXCLUDED.ats_family,
  confidence = EXCLUDED.confidence,
  matched_rule = EXCLUDED.matched_rule,
  routing_mode = EXCLUDED.routing_mode,
  support_reason = EXCLUDED.support_reason,
  support_status = EXCLUDED.support_status,
  updated_at = NOW();
