---
name: autonomous-apply-runtime
description: Use this when implementing Career AI's autonomous apply execution runtime: LangGraph node flow, queue-backed workers, typed tools, isolated Playwright sessions, deterministic branching, retries, cleanup, and replay-safe background execution.
---

# Autonomous Apply Runtime

Use this skill for the execution layer of on-click apply.

## Use it for

- LangGraph graph design
- worker lifecycle
- queue integration
- Playwright session management
- typed tool wrappers
- deterministic retries
- cleanup and replay safety

## Runtime boundaries

Prefer a dedicated runtime package:

- `packages/apply-runtime/src/graph/*`
- `packages/apply-runtime/src/tools/*`
- `packages/apply-runtime/src/session/*`
- `packages/apply-runtime/src/worker/*`

Keep graph orchestration separate from:

- contracts in `packages/contracts`
- domain rules in `packages/apply-domain`
- ATS-specific logic in `packages/apply-adapters`
- persistence primitives in `packages/persistence`

## Graph contract

Use LangGraph as a strict workflow engine, not a free-form agent loop.

Required nodes:

- `start_apply_run`
- `validate_profile_node`
- `snapshot_profile_node`
- `resolve_target_node`
- `select_adapter_node`
- `launch_browser_node`
- `open_target_node`
- `analyze_form_node`
- `create_mapping_plan_node`
- `fill_form_node`
- `upload_documents_node`
- `navigate_steps_node`
- `submit_application_node`
- `confirm_submission_node`
- `persist_artifacts_node`
- `send_notification_node`
- `finalize_success_node`
- `finalize_failure_node`
- `cleanup_node`

Required routing:

- ATS family
- unsupported target
- auth required
- failure classification
- confirmed vs unconfirmed submission

## Tool layer

Keep tools thin, typed, and reusable. Expect wrappers such as:

- `validate_profile_readiness`
- `create_profile_snapshot`
- `resolve_ats_target`
- `select_adapter`
- `launch_browser_session`
- `open_application_url`
- `capture_dom_signature`
- `capture_screenshot`
- `analyze_form_fields`
- `map_canonical_fields`
- `upload_document`
- `click_continue`
- `click_submit`
- `confirm_submission_result`
- `persist_apply_event`
- `persist_apply_artifact`
- `send_terminal_email`
- `finalize_run`
- `classify_runtime_error`
- `close_browser_session`

Do not bury side effects inside graph nodes when they belong in reusable tools.

## Session rules

- Use one isolated browser context per apply run.
- Capture screenshots at initial load, before submit, after submit, and on failure.
- Close sessions in `cleanup_node` even when earlier nodes fail.
- Keep file upload access scoped to the artifacts needed for the run.

## Retry rules

- Retry only idempotent or clearly safe steps.
- Never re-submit blindly.
- Protect terminal states with locks.
- Recover cleanly after worker restarts.
- Persist enough state to replay without mutating the original evidence trail.

## Background execution rules

- `Apply` must return control to the UI immediately after the run is queued.
- Do not stream the browser to the user.
- Do not run browser automation inside request handlers.
- Do not rely on in-memory only queues for durable execution.

## LangGraph and LangSmith usage

- Tag every run with stable metadata before execution starts.
- Emit node-level visibility for all state transitions and major tool calls.
- Keep graph versioning explicit so traces remain comparable across releases.

## Guardrails

- No open-ended reasoning loop for page interaction.
- No direct adapter logic inside generic graph nodes.
- No silent success path when confirmation is missing.
- No best-effort retries that can create duplicate applications.

## Navigation

- Load [autonomous-apply-adapters](../autonomous-apply-adapters/SKILL.md) for ATS detection and family-specific execution.
- Load [autonomous-apply-operations](../autonomous-apply-operations/SKILL.md) for traces, artifacts, notifications, replay, and tests.
- Load [autonomous-apply-foundation](../autonomous-apply-foundation/SKILL.md) if the runtime task forces contract or migration changes.
