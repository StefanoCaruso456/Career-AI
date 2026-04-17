---
name: autonomous-apply-operations
description: Use this when implementing or reviewing Career AI's autonomous apply observability and hardening: LangSmith tracing, event and artifact capture, email notifications, replay tooling, failure taxonomy, metrics, and test strategy for background apply runs.
---

# Autonomous Apply Operations

Use this skill for the parts of autonomous apply that make the system operable in production.

## Use it for

- LangSmith trace strategy
- event and artifact persistence
- terminal notifications
- replay and debugging workflow
- failure taxonomy
- metrics and dashboards
- automated test coverage
- support-facing documentation

## Observability baseline

Every run should emit structured metadata that can reconstruct the full story:

- `runId`
- `userId`
- `jobId`
- `companyName`
- `jobTitle`
- `atsFamily`
- `adapterId`
- `graphVersion`
- `profileSnapshotId`
- `terminalState`
- `failureCode`

Log node transitions, tool calls, timings, and classified failures.

## Artifact rules

Persist:

- screenshots
- DOM signatures or similar page evidence
- submission confirmation evidence
- failure evidence
- references to uploaded documents when safe

Artifacts must be tied to the run and discoverable from the trace and event stream.

## Notification rules

Trigger terminal email for:

- `submitted`
- `failed`
- `needs_attention`
- `submission_unconfirmed`

Email content should include:

- company
- job title
- final status
- completed time
- concise explanation
- next action when one exists

Do not add a review-before-submit email step.

## Replay and support

Design for operator inspection:

- replay from persisted state
- inspect mapped fields and failure point
- distinguish transient failure from site change
- preserve the original evidence trail

## Testing matrix

Write coverage at four layers:

- unit tests for detection, mapping, state transitions, failure classification, and dedupe
- integration tests for graph nodes, tool wrappers, persistence, and notifications
- end-to-end tests against mock Workday, Greenhouse, Lever, and hosted-form targets
- observability tests verifying LangSmith traces and artifact links exist for success and failure paths

Minimum failure scenarios:

- unsupported target
- selector drift
- CAPTCHA
- missing required document
- timeout
- network failure
- post-submit ambiguity

## Metrics and operational signals

Track at minimum:

- run volume
- success rate
- terminal state distribution
- adapter-level failure rates
- p50, p95, and p99 duration
- retry volume
- selector drift incidents

## Documentation expectations

Keep the runtime explainable. Add or update concise docs for:

- architecture overview
- node flow
- state machine
- adapter contract
- tracing strategy
- failure taxonomy
- replay workflow

## Guardrails

- Do not log sensitive raw profile values when identifiers or summaries are enough.
- Do not treat missing traces as acceptable for background work.
- Do not call a run production-ready without failure-path evidence.
- Do not skip targeted validation after changing adapters or runtime behavior.

After implementation, run [post-build-testing-and-validation](../post-build-testing-and-validation/SKILL.md).

## Navigation

- Load [autonomous-apply-runtime](../autonomous-apply-runtime/SKILL.md) when observability work requires graph or tool changes.
- Load [autonomous-apply-adapters](../autonomous-apply-adapters/SKILL.md) when tests or traces expose ATS-specific issues.
- Load [autonomous-apply-foundation](../autonomous-apply-foundation/SKILL.md) when metrics or evidence requirements force contract or schema changes.
