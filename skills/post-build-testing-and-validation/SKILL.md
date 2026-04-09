---
name: post-build-testing-and-validation
description: Use this after any feature build, bug fix, refactor, route/component/API change, or other completed code change. Switch into QA/verifier mode, run repo-appropriate build, runtime, feature, edge-case, and regression validation, and do not let the task be marked complete until you return PASS, PASS WITH WARNINGS, or FAIL with evidence.
---

# Post-Build Testing And Validation

You are the completion gate. Implementation is not complete until verification passes.

When this skill triggers, stop optimizing for writing code and start optimizing for disproving that the change is safe. Be skeptical, targeted, and evidence-driven.

## When To Use

Trigger this skill immediately after any meaningful implementation step, including:

- new feature work
- incremental feature updates
- bug fixes
- UI changes
- API or backend logic changes
- database or schema changes
- refactors
- configuration or integration changes
- any task that modified files or behavior

Run this skill before handoff, before calling the task complete, and before treating the work as ready to merge.

## Core Rule

A task is not done when the code is written.

A task is only done when:

- the relevant checks pass
- the changed functionality works as intended
- nearby functionality was checked for regressions
- evidence was captured
- a final verdict was produced

## Required Inputs

Before validating, gather and restate:

1. Task summary
2. Expected behavior
3. Scope of change
4. Risk areas
5. Available validation methods

Derive these from the best available evidence:

- recent diffs or edited files
- routes, components, endpoints, services, and workflows touched by the change
- repo scripts such as `package.json`, `Makefile`, CI config, or language-native test commands
- logs, console output, and runtime behavior

If a validation method is unavailable, say so explicitly and continue with the strongest available alternatives.

## Operating Mode

When this skill starts, switch into verifier mode:

- think like a QA engineer
- think like a skeptical reviewer
- think like a release gate owner
- prefer evidence over confidence
- actively try to break the changed behavior
- stay focused on the changed area and its nearby regression surface

Do not assume the implementation works just because the code looks correct.

## Validation Sequence

Follow this order unless the repo clearly requires a different sequence.

### 1. Understand What Must Be Verified

State:

- what changed
- what should now work
- what could fail
- which user flow or system behavior must be tested
- which nearby areas could regress

### 2. Static Validation

Run the narrowest meaningful repo-native static checks that cover the change, such as:

- dependency and import sanity
- linting
- type checking
- schema or config validation
- compile or build validation

Choose commands based on the actual stack. Examples:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pytest`
- `go test ./...`
- `cargo test`

If you do not run a broader repo-wide command, explain why the narrower check is the right tradeoff for the change.

### 3. Runtime Validation

Verify the changed system can actually run where relevant:

- dev server or service starts
- changed page, route, or component loads
- changed endpoint responds
- changed background or backend flow executes
- no fatal startup or runtime crash occurs
- no obvious env or config issue was introduced

### 4. Feature Validation

Test the exact thing that was implemented:

- the primary happy path
- the key user action or system action
- the expected output or result
- success state
- loading, empty, error, and success states when relevant
- persistence, network wiring, and UI wiring when relevant

### 5. Edge Case Validation

Test the most likely failure conditions for the changed area:

- empty input
- invalid input
- missing or null state
- loading state
- duplicate action or retry behavior
- permission or auth failure if relevant
- network or API failure if relevant
- no-data state
- realistic unexpected user behavior

Do not brute-force infinite cases. Choose the highest-value edge cases.

### 6. Regression Validation

Check nearby existing behavior most likely to have been affected:

- sibling routes or components
- related create, read, update, or delete flows
- surrounding state management
- navigation, layout, or styling around UI changes
- related endpoints or service contracts
- console and server logs for unrelated new errors

### 7. Evidence Collection

Capture and summarize:

- commands run
- files, routes, endpoints, or workflows tested
- logs or outputs reviewed
- what passed
- what failed
- what could not be verified

No silent assumptions.

### 8. Final Verdict

Return exactly one of:

- `PASS`
- `PASS WITH WARNINGS`
- `FAIL`

Use these definitions:

- `PASS`: required validation succeeded, the core feature works, and no blocking issue remains in scope
- `PASS WITH WARNINGS`: the core feature appears to work, but there are explicit non-blocking limitations, caveats, or low-risk gaps
- `FAIL`: the build, type check, runtime, feature behavior, or regression check failed, or confidence is too low because critical validation could not be performed

## Severity Guidance

These usually require `FAIL`:

- compile or type failure
- broken route, page, or component
- server startup failure
- failed API or integration path
- regression in nearby critical functionality
- inability to verify a high-risk change

These may allow `PASS WITH WARNINGS` when clearly documented:

- minor styling or polish issue
- non-critical warning
- unverified low-risk path
- missing optional coverage offset by direct manual checks

## Fix-And-Retest Rule

If the verdict is `FAIL`, do not mark the task complete.

Instead:

1. identify the failure clearly
2. explain the likely cause
3. fix the issue
4. re-run the relevant validation steps
5. produce a new verdict

Repeat until the result is `PASS`, `PASS WITH WARNINGS`, or a real external blocker prevents further progress.

If blocked, state the exact blocker and how it affects confidence.

## Required Behavior Rules

The agent must:

- verify instead of assume
- test the changed area directly
- check nearby regression risk
- report uncertainty honestly
- fail loudly when confidence is too low

The agent must not:

- mark work complete without validation
- assume code works because it looks correct
- skip testing because the change seems small
- hide missing validation
- claim success without evidence
- ignore warnings, errors, or failed checks

## Strategy Guidance

For frontend work, prefer:

- lint, type check, and build validation
- component or route validation if available
- browser or manual interaction checks
- console review
- loading, empty, and error state checks

For backend or API work, prefer:

- lint, type check, and build validation
- server startup
- endpoint validation
- request and response verification
- auth or permission checks if relevant
- log review

For full-stack work, verify both sides:

- frontend trigger
- network request
- backend processing
- persistence if applicable
- UI success or error state

For bug fixes:

- define the old bug clearly
- reproduce it when possible
- confirm the bug no longer occurs
- verify no side effect was introduced

For refactors:

- focus on behavior parity
- run existing tests
- verify startup and build stability
- inspect touched dependencies and imports

## Output Contract

Return results in this exact structure:

```markdown
# Post-Build Testing and Validation Report

## 1. Change Summary
- What was built, fixed, or changed
- Why it was changed

## 2. Expected Behavior
- What should now work
- What success looks like

## 3. Scope Reviewed
- Files changed
- Routes/components/endpoints/workflows impacted
- Risk areas checked

## 4. Validation Performed
### Static Checks
- Commands run
- Results

### Runtime Checks
- What was started or loaded
- Results

### Feature Checks
- Happy path tested
- Results

### Edge Case Checks
- Edge cases tested
- Results

### Regression Checks
- Related functionality tested
- Results

## 5. Evidence
- Key outputs
- Logs reviewed
- Test results
- Errors or warnings observed

## 6. Issues Found
- List any issues discovered
- Note whether fixed or still open

## 7. Gaps / Limits
- What could not be verified
- Why it could not be verified
- Impact on confidence

## 8. Final Verdict
- PASS / PASS WITH WARNINGS / FAIL

## 9. Reason for Verdict
- Clear explanation for the final decision

## 10. Next Action
- Mark complete
- Fix and retest
- Request missing dependency, input, or environment if blocked
```

## Completion Gate

The task may only be marked complete if the final verdict is:

- `PASS`
- `PASS WITH WARNINGS` with explicitly non-blocking warnings

The task must remain open if the final verdict is:

- `FAIL`

## Orchestrator Rule

If this skill is part of a larger agent system, invoke it automatically after implementation is declared complete and before handoff, merge, or "done" status is allowed.

Recommended workflow:

`Plan -> Implement -> Run post-build-testing-and-validation -> Fix if needed -> Re-test -> Final verdict -> Handoff`

## One-Line Enforcement Rule

No increment is complete until it has been tested, validated, and given a documented verdict with evidence.
