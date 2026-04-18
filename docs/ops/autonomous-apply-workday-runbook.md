# Autonomous Apply Workday Ops Runbook

This runbook is for limited production rollout of Workday-only autonomous apply.

## Rollout Scope

- autonomous apply is enabled only for Workday targets
- non-Workday targets must fall back to `open_external` and must not queue runs
- worker runs inline/in-process with bounded concurrency

## Required Environment

Minimum required:

- `AUTONOMOUS_APPLY_ENABLED`
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

Tracing (recommended):

- `LANGSMITH_API_KEY`
- `AUTONOMOUS_APPLY_LANGSMITH_PROJECT`

## Pre-Launch Checklist

1. Apply DB migrations (`npm run db:migrate`).
2. Confirm Workday-only gating in API responses:
   - Workday target -> `action=queued`
   - non-Workday target -> `action=open_external`
3. Verify authenticated visibility endpoints:
   - `GET /api/v1/apply-runs`
   - `GET /api/v1/apply-runs/:runId`
4. Confirm inline worker concurrency is explicitly set (start with `1`).
5. Confirm terminal email notifications are enabled in the environment.

## Runtime Verification

## 1) Verify run creation and trace id

```sql
SELECT id, status, terminal_state, trace_id, created_at, started_at, completed_at
FROM apply_runs
WHERE id = '<apply_run_id>';
```

Expected:

- `trace_id` is non-null for newly queued Workday runs
- initial status transitions out of `queued` after worker claim

## 2) Verify event timeline correlation

```sql
SELECT run_id, trace_id, state, step_name, event_type, timestamp
FROM apply_run_events
WHERE run_id = '<apply_run_id>'
ORDER BY timestamp ASC;
```

Expected:

- all events for the run carry the same `trace_id`
- timeline includes preflight and runtime step events

## 3) Verify LangSmith correlation

Search LangSmith traces by either:

- metadata `runId=<apply_run_id>`
- tag `trace:<trace_id>`

Expected:

- trace metadata contains run/job/user fields
- tags include both `run:<apply_run_id>` and `trace:<trace_id>`

## Stuck-Run Monitoring

Use API/UI alertable markers (`stuck_queued`, `stuck_in_progress`) and/or DB checks:

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

Tune thresholds to match `AUTONOMOUS_APPLY_STUCK_QUEUED_MINUTES` and `AUTONOMOUS_APPLY_STUCK_IN_PROGRESS_MINUTES`.

## Inline Worker Limitations

- worker execution shares app process resources
- no dedicated worker queue isolation in this phase
- retries are intentionally conservative to reduce duplicate submission risk
- roll out with low concurrency and increase only after stable observation

## Rollback

1. Set `AUTONOMOUS_APPLY_ENABLED=false`.
2. Keep endpoints online; all apply clicks return `open_external`.
3. Optionally set `AUTONOMOUS_APPLY_INLINE_WORKER_ENABLED=false` to stop processing new queued runs.
4. Monitor existing in-progress runs until they reach terminal states.
5. Re-enable only after root-cause fix and staged revalidation.
