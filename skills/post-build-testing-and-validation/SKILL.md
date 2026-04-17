---
name: post-build-testing-and-validation
description: Use this after any feature build, bug fix, refactor, route/component/API change, or other completed code change. Switch into QA/verifier mode, run repo-appropriate build, runtime, feature, edge-case, and regression validation, and do not let the task be marked complete until you return PASS, PASS WITH WARNINGS, or FAIL with evidence.
---

# Post-Build Testing And Validation

You are the completion gate. Implementation is not done until the changed behavior has been tested and a verdict has been recorded with evidence.

## When to use

Trigger this skill after any meaningful code or behavior change, including:

- new features
- bug fixes
- refactors
- UI updates
- API or backend work
- schema or migration changes
- config or integration changes

Run it before handoff, before publishing, and before calling the work complete.

## Core rule

A task is complete only when:

- the relevant checks passed
- the changed behavior was tested directly
- nearby regression risk was checked
- evidence was captured
- a verdict was issued

## Operating mode

Switch from builder mode to verifier mode:

- prefer evidence over confidence
- try to disprove the change, not defend it
- stay focused on the changed surface and its nearest regressions
- say explicitly what could not be verified

## Validation sequence

1. Restate the task, expected behavior, scope, risk areas, and available validation methods.
2. Run the narrowest meaningful static checks for the change.
3. Run runtime validation where relevant.
4. Test the primary feature or user flow directly.
5. Exercise the highest-value edge cases.
6. Check nearby regressions.
7. Summarize commands, outputs, and observed results.
8. Return exactly one verdict: `PASS`, `PASS WITH WARNINGS`, or `FAIL`.

## Static validation

Prefer the smallest repo-native checks that still cover the change:

- linting
- type checking
- build or compile validation
- schema or config validation
- targeted tests

Examples:

- `npm run build`
- `npm run test`
- `pnpm test`
- `pytest`
- `go test ./...`

If you choose a narrow check instead of a repo-wide one, explain why it is the correct tradeoff.

## Runtime validation

Where relevant, confirm the changed system actually runs:

- server or worker starts
- route or page loads
- endpoint responds
- background flow executes
- no obvious startup or runtime crash was introduced

## Feature, edge, and regression checks

Always test:

- the happy path
- the exact user or system action that changed
- the most likely failure conditions
- nearby behavior most likely to regress

High-value edge cases include:

- empty or missing state
- invalid input
- duplicate or retry behavior
- auth or permission failures
- no-data and error states
- slow or failing network paths when relevant

## Guardrails

The agent must:

- verify instead of assume
- test the changed area directly
- report uncertainty honestly
- fail loudly when confidence is too low

The agent must not:

- mark work complete without validation
- claim success without evidence
- hide missing checks
- ignore failed commands, errors, or warnings

## Verdict definitions

- `PASS`: required validation succeeded and no blocking issue remains in scope.
- `PASS WITH WARNINGS`: the change appears correct, but non-blocking gaps or caveats remain and are stated clearly.
- `FAIL`: validation failed, a regression was found, or critical verification could not be performed.

Use `FAIL` for issues such as:

- compile or type failures
- broken routes, components, or endpoints
- startup failures
- failed core workflows
- high-risk changes with missing verification

## Fix and retest rule

If the verdict is `FAIL`:

1. identify the failure
2. explain the likely cause
3. fix it
4. re-run the relevant validation
5. issue a new verdict

Repeat until you reach `PASS`, `PASS WITH WARNINGS`, or a real external blocker.

## Output contract

Return a compact report with these sections:

1. Change summary
2. Expected behavior
3. Scope reviewed
4. Validation performed
5. Evidence
6. Issues found
7. Gaps or limits
8. Final verdict
9. Reason for verdict
10. Next action

## Completion gate

The task may only be treated as complete when the final verdict is:

- `PASS`
- `PASS WITH WARNINGS` with explicitly non-blocking warnings

If this skill is part of a larger workflow, run it before handoff, merge, or done status.
