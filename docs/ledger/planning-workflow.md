# Planning Workflow

How a new feature travels from idea → deployed code in this repo. Lightweight — we're optimizing for velocity, not process.

## The flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐
│  Strategic  │     │   Roadmap    │     │  User   │     │   Spec   │     │ Implement │
│    plan     │ ──▶ │  (phased)    │ ──▶ │ stories │ ──▶ │ (short)  │ ──▶ │  & ship   │
└─────────────┘     └──────────────┘     └─────────┘     └──────────┘     └──────────┘
       │                    │                  │                │                │
 plan.md /            feature-tracker.md  planning/       planning/specs/   commits +
 graceful-            (this folder)       user-stories    *.md              feature-tracker
 juggling-pie                                                               check boxes
```

## Where each piece lives

| Layer | File / Location | What's there | Who writes it |
|---|---|---|---|
| **Strategic plan** | `~/.claude/plans/graceful-juggling-pie.md` (mirrored to `fsyeddev/capstone:docs/plan.md`) | Locked architecture decisions, T0–T8 phase roadmap, session progress log | Writer during design sessions |
| **Roadmap / tracker** | [`docs/feature-tracker.md`](./feature-tracker.md) | One-line inventory of shipped / in flight / planned / deferred / out-of-scope | Updated on every feature commit |
| **User stories** | [`docs/planning/user-stories/`](./planning/user-stories/) *(created on first use)* | `As a <persona>, I want <thing>, so that <outcome>.` One file per story, grouped by persona. | Written when moving a feature from "planned" to "in flight" |
| **Specs** | [`docs/planning/specs/`](./planning/specs/) *(created on first use)* | Technical implementation spec per feature: problem, scope, service boundary, data model, test plan, open questions. Pattern: one file per feature, named `NNN-slug.md`. | Written before implementation starts |
| **Implementation** | `services/*/`, `packages/*/`, `protocol/packages/*/` | Code. Commits reference the spec file. | Claude Code + human review |
| **Decisions (ADRs)** | `docs/open-questions.md` (for unresolved), spec files (for resolved) | Architecture decisions with rationale. When something in open-questions gets answered, promote it into the relevant spec. | Writer when a choice is made |

## The loop

1. **Something lands in the tracker as "planned"** — either from the strategic plan (T1–T7 features) or from a user ask. One-liner description, no details yet.
2. **When we decide to work on it**, draft a user story: who wants it, what outcome, what unacceptable alternative. One paragraph is usually enough.
3. **Before writing code**, draft a spec. Short. The template below. Resolves ambiguity *before* burning implementation time.
4. **Implement against the spec.** Reference the spec file path in the commit message. Update `feature-tracker.md` to move the item from "In flight" to "Shipped" with the commit short-hash.
5. **When a decision comes up mid-implementation that isn't in the spec**, either update the spec (if small) or pause and resolve it (if material). Don't let decisions evaporate into commit messages.

## Spec template

```markdown
# <NNN>-<feature-slug>

**Status**: Draft | Ready | In Progress | Shipped
**Owner**: <name or handle>
**Related**: feature-tracker entry, user story, plan phase

## Problem

Two–three sentences. What's broken or missing today, and what would change for the user/operator/developer.

## Scope

- **In**: bullet list of what this spec covers
- **Out**: bullet list of what's intentionally deferred or won't be touched

## Design

Short architectural sketch. Which service(s) own which piece. What new types/endpoints/schemas are introduced. Link to existing code or specs where relevant.

## Data model / API

Types, endpoints, DB columns, event payloads — whatever applies. Concrete enough that implementation is mechanical.

## Test plan

Manual or automated. What demonstrates the feature works. What demonstrates it doesn't crash on edge cases.

## Open questions

Known unknowns. Either resolve before marking Ready, or note the decision deadline.

## Migration / rollout

If the feature changes an existing contract, how do consumers migrate? If it's new, this section is "N/A."
```

## When to skip the spec

For trivial changes (bug fix, rename, dependency bump, doc update) — just commit. The spec overhead is there to de-risk non-trivial work, not to slow down cleanup.

Rule of thumb: if the change is **reversible in under an hour** and doesn't touch a public contract, skip the spec. Otherwise write one.

## What we don't have yet

The folders `docs/planning/user-stories/` and `docs/planning/specs/` don't exist until the first story or spec is written. Create them on first use. The `TEMPLATE-spec.md` file can be added to `docs/planning/specs/` when the first spec is drafted.

## What this isn't

- **Not a ticket system.** Feature-tracker is a checklist; it doesn't replace whatever issue tracker the team uses for day-to-day.
- **Not agile ceremony.** No sprints, no story points, no burndown. The structure exists because Claude Code implementations benefit from written specs, not because we need ritual.
- **Not a PRD library.** Specs here are implementation-focused, not product-strategy documents. Product strategy lives in the strategic plan (`plan.md`).
