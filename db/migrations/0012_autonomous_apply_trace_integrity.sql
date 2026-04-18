ALTER TABLE apply_run_events
ADD COLUMN IF NOT EXISTS trace_id text;

UPDATE apply_run_events
SET trace_id = apply_runs.trace_id
FROM apply_runs
WHERE run_id = apply_runs.id
  AND apply_run_events.trace_id IS NULL;

CREATE INDEX IF NOT EXISTS apply_run_events_trace_idx
  ON apply_run_events (trace_id, timestamp ASC);
