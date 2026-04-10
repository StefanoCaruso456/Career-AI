# Memory Test Plan

## Priority cases

1. duplicate facts dedupe into one active memory
2. conflicting facts surface as contradictions
3. explicit user correction supersedes the outdated memory
4. repo facts remain authoritative over semantic summaries
5. thread-scoped facts do not leak into global retrieval
6. low-confidence candidates are rejected
7. deleted memories stop appearing in active retrieval
8. retrieval traces explain why entries were returned

## Validation matrix

| Scenario | Expected outcome |
| --- | --- |
| Same fact written twice | Second write rejected as duplicate |
| Same title, different content, no correction | Write rejected and conflict logged |
| Same title, different content, correction | New memory accepted, old memory superseded |
| Thread-scoped memory retrieved from global-only query | Excluded |
| Repo source conflicts with semantic memory | Repo authority note emitted |
| Candidate tagged transient | Rejected |

## Runtime checks

- unit tests for write pipeline
- unit tests for retrieval ranking and scope filtering
- unit tests for reconciliation and compaction behavior
- build validation through `npm run build`
