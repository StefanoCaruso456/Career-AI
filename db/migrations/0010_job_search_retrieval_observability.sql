ALTER TABLE job_search_events
  ADD COLUMN IF NOT EXISTS engine_version text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS query_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_counts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS widening_steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS zero_result_reasons_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS latency_breakdown_ms_json jsonb NOT NULL DEFAULT '{}'::jsonb;
