# Job Search Retrieval Test Plan

## Coverage areas

- Query parsing
- Filter normalization
- Canonical job mapping
- Metadata-first hard filtering
- Lexical retrieval
- Semantic reranking
- Deterministic widening
- Exact vs fallback result separation
- Known vs unknown compensation handling
- Zero-result messaging
- Feature-flagged integration through the existing jobs search entrypoint

## Core parser cases

- `find me new jobs in austin texas`
- `show me remote ai engineer roles posted in the last 24 hours`
- `find product roles over 180k at apple or nvidia`
- `show me hybrid jobs in austin with sql and python on data teams`
- `show me onsite recruiter jobs in dallas`
- `find senior software engineer jobs with kubernetes`
- `show me highest paying remote product manager roles`
- `find jobs at google with sponsorship`
- `show me principal roles posted today`
- `find healthcare data jobs in texas`

## Retrieval regression checks

- Austin jobs are found through canonical location metadata instead of description-only matching.
- `new jobs` and `last 24 hours` resolve to different recency windows.
- Remote, hybrid, and onsite filters behave deterministically.
- Salary minimums, ranges, and unknown-compensation buckets are handled explicitly.
- Team and skill constraints meaningfully affect ranking.
- Exact matches remain separated from widened fallback matches.
- Zero-result responses explain the attempted filters and widening path.

## Rollout validation

- Default behavior remains unchanged with `JOB_SEARCH_RETRIEVAL_V2_ENABLED` unset.
- The v2 engine is used when `JOB_SEARCH_RETRIEVAL_V2_ENABLED=true`.
- Existing jobs panel routes still return the legacy panel contract with richer optional diagnostics added.
