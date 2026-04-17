---
name: autonomous-apply-foundation
description: Use this when defining or changing Career AI's autonomous apply contracts: immutable application profile snapshots, apply run states, failure codes, database schema, repositories, route contracts, permissions, and idempotent run creation for on-click apply.
---

# Autonomous Apply Foundation

Use this skill for contract-first work on the on-click apply system.

## Use it for

- domain models
- Zod schemas and DTOs
- migrations and repositories
- API route shape
- permissions and idempotency
- apply-ready validation
- UI-to-backend handoff from the current profile gate

## Start from current seams

- `components/easy-apply-profile/profile-completion-guard.tsx`
- `app/api/v1/me/application-profiles/route.ts`
- `lib/application-profiles/*`
- `packages/contracts/src/application-profiles.ts`
- `packages/persistence/src/*`
- `packages/jobs-domain/src/service.ts`

The repo already has reusable profile capture and ATS-oriented sourcing. Extend those seams instead of inventing a parallel data model.

## Target module boundaries

- Add shared contracts in `packages/contracts/src/apply.ts` and export via `packages/contracts/src/index.ts`.
- Add new domain logic in `packages/apply-domain/src/*`.
- Add persistence repositories and migrations in `packages/persistence/src/*` and `db/migrations/*`.
- Keep HTTP coordination thin in `app/api/v1/apply-runs/*`.

## Minimum domain objects

- `ApplicationProfileSnapshot`
- `ApplyRun`
- `ApplyRunEvent`
- `ApplyRunArtifact`
- `AtsDetectionResult`

Each run stores the exact immutable snapshot it used.

## Snapshot rules

- Build snapshots from the reusable application profile plus job-specific metadata.
- Store provenance, schema family, version, and capture time.
- Adapters and runtime read snapshots only, never mutable profile tables.
- Keep employer-specific deltas separate from shared reusable data.

## Apply run states

Use explicit typed states. At minimum:

- `created`
- `queued`
- `preflight_validating`
- `preflight_failed`
- `snapshot_created`
- `detecting_target`
- `selecting_adapter`
- `launching_browser`
- `auth_required`
- `filling_form`
- `uploading_documents`
- `navigating_steps`
- `submitting`
- `submitted`
- `submission_unconfirmed`
- `failed`
- `needs_attention`
- `completed`

Terminal outcomes:

- `submitted`
- `failed`
- `needs_attention`
- `submission_unconfirmed`

## Failure codes

Support machine-readable codes from day one:

- `PROFILE_INCOMPLETE`
- `UNSUPPORTED_TARGET`
- `ATS_DETECTION_FAILED`
- `LOGIN_REQUIRED`
- `CAPTCHA_ENCOUNTERED`
- `REQUIRED_FIELD_UNMAPPED`
- `REQUIRED_DOCUMENT_MISSING`
- `FILE_UPLOAD_FAILED`
- `FORM_STRUCTURE_CHANGED`
- `SUBMIT_BLOCKED`
- `SUBMISSION_NOT_CONFIRMED`
- `NETWORK_FAILURE`
- `TIMEOUT`
- `UNKNOWN_RUNTIME_ERROR`

## Database shape

Create tables or equivalent storage for:

- `apply_runs`
- `apply_run_events`
- `apply_run_artifacts`
- `profile_snapshots`

Persist timestamps, adapter identity, ATS family, attempt count, failure code, and failure message.

## API contract

Prefer this surface:

- `POST /api/v1/apply-runs`
- `GET /api/v1/apply-runs/:id`
- `GET /api/v1/me/apply-runs`
- optional `POST /api/v1/apply-runs/:id/retry`

Rules:

- `POST` validates readiness, snapshots the profile, creates a run, enqueues work, and returns immediately.
- Routes must not perform browser automation inline.
- Use idempotency and dedupe so one click cannot produce duplicate submissions.

## UI handoff rules

When replacing the current external open flow:

- keep the existing profile-completion guard behavior
- swap `window.open(applyUrl)` for run creation once the profile is ready
- keep the user in Career AI
- expose queued and terminal status in-app, not a live browser view

## Guardrails

- Persist state before side effects.
- Lock terminal runs against duplicate submission attempts.
- Keep domain rules out of React components.
- Keep adapter-specific fields out of shared API handlers.
- Prefer additive migrations and typed repositories over ad hoc JSON writes.

## Navigation

- Load [autonomous-apply-runtime](../autonomous-apply-runtime/SKILL.md) when the task moves into queueing, LangGraph, or Playwright execution.
- Load [autonomous-apply-adapters](../autonomous-apply-adapters/SKILL.md) when the task moves into ATS detection or form automation.
- Load [autonomous-apply-operations](../autonomous-apply-operations/SKILL.md) when the task moves into tracing, notifications, artifacts, or replay.
