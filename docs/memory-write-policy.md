# Memory Write Policy

## Principle

Do not save everything. Save only facts that are likely to matter again, stable enough to reuse, and strong enough to justify long-term storage.

## Required fields

Every semantic memory write must include:

- provenance
- confidence
- scope
- timestamp
- write reason

## Write classes

### Always save

- explicit user preferences
- stable identity facts
- durable repo and workspace constraints

Threshold: `0.78`

### Sometimes save

- recurring workflow patterns
- organization facts
- recurring collaborator relationships

Threshold: `0.86`

### Never auto-save

- transient tasks
- one-off drafts
- noisy tool logs
- speculative assumptions
- agent-only guesses

## Rejection rules

Reject a semantic write when:

- confidence is below the threshold for its write class
- the candidate is tagged or described as transient or speculative
- the candidate duplicates an existing active memory
- the candidate conflicts with an active memory and is not marked as a correction or repo-confirmed update

## Correction rules

- explicit corrections may supersede older active memories
- superseded records stay auditable with `status = "superseded"`
- deletions use tombstones through `status = "deleted"`

## Repo fact rule

If a durable fact already exists clearly in a repo file or doc, semantic memory should store a normalized reusable pointer with provenance rather than a bloated duplicate.
