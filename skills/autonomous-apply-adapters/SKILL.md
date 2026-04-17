---
name: autonomous-apply-adapters
description: Use this when implementing Career AI's ATS detection and apply adapters: Workday, Greenhouse, Lever, generic hosted forms, selector isolation, mapping plans, document upload behavior, confirmation logic, and machine-readable failure handling.
---

# Autonomous Apply Adapters

Use this skill for ATS family detection and form automation modules.

## Use it for

- ATS resolver logic
- adapter interfaces
- Workday automation
- Greenhouse automation
- Lever automation
- generic hosted-form fallback
- selector and mapping config design
- adapter-specific failure handling

## Current repo anchors

- `lib/application-profiles/resolver.ts`
- `lib/application-profiles/types.ts`
- `lib/application-profiles/config.ts`
- `packages/jobs-domain/src/service.ts`

The existing resolver is only good enough for gating the current apply button. Treat it as a seed, not the final autonomous apply detector.

## Preferred package layout

- `packages/apply-adapters/src/shared/*`
- `packages/apply-adapters/src/workday/*`
- `packages/apply-adapters/src/greenhouse/*`
- `packages/apply-adapters/src/lever/*`
- `packages/apply-adapters/src/generic-hosted-form/*`

Keep selectors, DOM signatures, and mapping rules close to each adapter, not in the core graph.

## Detection rules

Resolve ATS family from a combination of:

- hostname
- URL patterns
- title markers
- DOM markers
- known ATS signatures

Return at least:

- `atsFamily`
- `confidence`
- `matchedRule`
- `fallbackStrategy`

Supported families:

- `workday`
- `greenhouse`
- `lever`
- `generic_hosted_form`
- `unsupported_target`

## Adapter contract

Every adapter should implement methods equivalent to:

- `canHandle`
- `preflight`
- `openTarget`
- `loginIfNeeded`
- `analyzeForm`
- `createMappingPlan`
- `fillFields`
- `uploadDocuments`
- `advanceStep`
- `submit`
- `confirmSubmission`
- `collectArtifacts`
- `classifyFailure`

## Mapping rules

- Read only from orchestration context and immutable profile snapshot.
- Build a mapping plan before mutating the page.
- Fail when a required field cannot be mapped safely.
- Never invent values for required questions.
- Keep employer-specific deltas explicit instead of overloading shared profile fields.

## Submission rules

- Save evidence before and after submit.
- Confirm success through adapter-specific rules.
- If the click happened but confirmation is unclear, return `submission_unconfirmed`.
- Treat CAPTCHA, forced login, or selector drift as explicit classified failures.

## Family priorities

Implement in this order:

1. Workday
2. Greenhouse
3. Lever
4. Generic hosted form

The generic hosted-form adapter should stay constrained and confidence-based. If confidence is low, fail safely.

## Guardrails

- Do not let adapters read mutable user profile storage directly.
- Do not place selectors inline inside worker nodes.
- Do not reuse one adapter's confirmation rules for another family.
- Do not broaden generic-form heuristics until named ATS families are stable.

## Navigation

- Load [autonomous-apply-runtime](../autonomous-apply-runtime/SKILL.md) when adapter work requires graph or tool changes.
- Load [autonomous-apply-operations](../autonomous-apply-operations/SKILL.md) when adding traces, artifacts, replay hooks, or test coverage.
- Load [autonomous-apply-foundation](../autonomous-apply-foundation/SKILL.md) when adapter changes require new contracts or snapshot fields.
