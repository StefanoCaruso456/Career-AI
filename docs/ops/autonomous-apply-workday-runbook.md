# Autonomous Apply Ops Runbook

This runbook describes the autonomous-apply runtime that exists in the repo today.

## Supported Targets

- queueable ATS families: Workday and Greenhouse
- unsupported ATS families: `open_external`
- default execution mode: inline or worker-loop execution against the same app code

## Required Environment

- `AUTONOMOUS_APPLY_ENABLED`
- `AUTONOMOUS_APPLY_WORKER_MODE`
- `AUTONOMOUS_APPLY_INLINE_WORKER_ENABLED`
- `AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY`
- `AUTONOMOUS_APPLY_WORKER_BATCH_SIZE`
- `AUTONOMOUS_APPLY_NAVIGATION_TIMEOUT_MS`
- `AUTONOMOUS_APPLY_STEP_TIMEOUT_MS`
- `AUTONOMOUS_APPLY_SUBMIT_TIMEOUT_MS`
- `AUTONOMOUS_APPLY_CONFIRMATION_TIMEOUT_MS`
- `AUTONOMOUS_APPLY_RUN_TIMEOUT_MS`
- `AUTONOMOUS_APPLY_ARTIFACTS_DIR`
- `AUTONOMOUS_APPLY_ARTIFACT_CLEANUP_ENABLED`
- `AUTONOMOUS_APPLY_ARTIFACT_RETENTION_HOURS`
- `AUTONOMOUS_APPLY_STUCK_QUEUED_MINUTES`
- `AUTONOMOUS_APPLY_STUCK_IN_PROGRESS_MINUTES`
- `DATABASE_URL`

External worker mode also requires shared S3-backed artifact storage.

## Pre-Launch Checklist

1. Run `npm run db:migrate`.
2. Confirm supported-target routing:
   - Workday or Greenhouse target -> `action=queued`
   - unsupported target -> `action=open_external`
3. Verify authenticated status routes:
   - `GET /api/v1/apply-runs`
   - `GET /api/v1/apply-runs/:runId`
4. Start with low concurrency.
5. If using the separate worker loop, run `npm run worker:apply` or `npm run dev:apply-worker`.

## Runtime Verification

### Run record

```sql
SELECT id, status, terminal_state, trace_id, created_at, started_at, completed_at
FROM apply_runs
WHERE id = '<apply_run_id>';
```

Expected:

- `trace_id` is populated
- queued runs move out of `queued` when the worker loop claims them

### Event timeline

```sql
SELECT run_id, trace_id, state, step_name, event_type, timestamp
FROM apply_run_events
WHERE run_id = '<apply_run_id>'
ORDER BY timestamp ASC;
```

Expected:

- every event keeps the same `trace_id`
- timeline includes preflight and runtime transitions

### LangSmith correlation

Search by either:

- metadata `runId=<apply_run_id>`
- tag `trace:<trace_id>`

## Stuck-Run Monitoring

```sql
SELECT id, status, created_at, started_at, terminal_state
FROM apply_runs
WHERE terminal_state IS NULL
  AND (
    (status = 'queued' AND created_at < NOW() - INTERVAL '20 minutes')
    OR
    (status <> 'queued' AND COALESCE(started_at, created_at) < NOW() - INTERVAL '45 minutes')
  )
ORDER BY created_at ASC;
```

Tune the query to the environment values for `AUTONOMOUS_APPLY_STUCK_QUEUED_MINUTES` and `AUTONOMOUS_APPLY_STUCK_IN_PROGRESS_MINUTES`.

## Operational Notes

- Inline mode shares resources with the main app process.
- The worker-loop script runs the same runtime outside the request path; it is not a different codebase.
- `AUTONOMOUS_APPLY_WORKER_MODE=external` is configuration-valid, but queue readiness fails without shared S3 storage.

## Rollback

1. Set `AUTONOMOUS_APPLY_ENABLED=false`.
2. Existing clicks fall back to `open_external`.
3. If needed, stop the worker loop or set worker mode to `disabled`.
4. Let in-flight runs settle before re-enabling.
