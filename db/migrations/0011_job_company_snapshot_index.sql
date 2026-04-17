UPDATE job_postings
SET normalized_company_name = LOWER(company_name)
WHERE normalized_company_name IS NULL;

CREATE INDEX IF NOT EXISTS job_postings_active_company_snapshot_idx
  ON job_postings (
    normalized_company_name,
    trust_score DESC,
    updated_at DESC,
    posted_at DESC,
    title ASC
  )
  WHERE is_active = true
    AND normalized_company_name IS NOT NULL;
