---
name: autonomous-apply-system
description: Use this when planning, implementing, or reviewing Career AI's on-click apply system: reusable-profile gating, background apply runs, immutable profile snapshots, LangGraph orchestration, LangSmith tracing, Playwright worker automation, ATS detection, adapters, notifications, and safe submission rules.
---

# Autonomous Apply System

Use this skill as the entry point for Career AI's backend-only autonomous apply work.

Use it for:

- on-click apply architecture
- profile-to-apply-run handoff
- background execution design
- ATS detection and adapter boundaries
- Playwright worker automation
- LangGraph and LangSmith adoption
- notifications, artifacts, replay, and failure-safe delivery

Do not use it for:

- generic job retrieval
- pure UI polish not tied to apply execution
- recruiter workflows unrelated to candidate application submission

## Product contract

- The reusable application profile stays the first apply gate.
- After the profile is complete, `Apply` starts background work and returns immediately.
- The user stays inside Career AI and does not watch the browser automation.
- There is no approval step before submit.
- The system must not claim success without confirmation evidence.
- Unsupported or blocked flows must fail explicitly and traceably.

## Read these seams first

- `components/easy-apply-profile/profile-completion-guard.tsx`
- `app/api/v1/me/application-profiles/route.ts`
- `lib/application-profiles/*`
- `packages/contracts/src/application-profiles.ts`
- `packages/jobs-domain/src/service.ts`
- `packages/persistence/src/*`

## Recommended repo layout

- Contracts: `packages/contracts/src/apply.ts`
- Domain rules: `packages/apply-domain/src/*`
- Runtime and graph execution: `packages/apply-runtime/src/*`
- ATS adapters: `packages/apply-adapters/src/*`
- Persistence: `packages/persistence/src/*`
- API routes: `app/api/v1/apply-runs/*`
- Docs: `docs/architecture/autonomous-apply-system.md`

## Skill hierarchy

Use this file to route into the narrower skill that matches the active slice:

- Contracts, run states, schema, repositories, or API surface:
  [autonomous-apply-foundation](../autonomous-apply-foundation/SKILL.md)
- Queueing, LangGraph nodes, Playwright sessions, tool wrappers, or worker flow:
  [autonomous-apply-runtime](../autonomous-apply-runtime/SKILL.md)
- ATS resolver logic, Workday, Greenhouse, Lever, or generic hosted-form behavior:
  [autonomous-apply-adapters](../autonomous-apply-adapters/SKILL.md)
- LangSmith tags, artifacts, notifications, replay, docs, or test coverage:
  [autonomous-apply-operations](../autonomous-apply-operations/SKILL.md)

Load multiple sibling skills only when the task truly crosses those boundaries.

## Default implementation order

1. Foundation
2. Runtime
3. Adapters
4. Operations and hardening

## Guardrails

- Prefer deterministic typed services over agentic loops.
- Keep HTTP routes thin and orchestration out of App Router handlers.
- Keep selectors and DOM rules out of core graph logic.
- Adapters consume immutable snapshots only.
- Persist every state transition before moving to the next step.
- Treat `submission_unconfirmed` as a first-class terminal outcome.
- Do not introduce OpenClaw, desktop control, or live browser streaming.
