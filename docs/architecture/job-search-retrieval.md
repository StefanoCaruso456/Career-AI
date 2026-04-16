# Job Search Retrieval Architecture

## Current flow

Before the v2 engine, job retrieval already existed, but it was centered on a thin `JobPostingDto` plus a mixed search parser/ranker pipeline:

- prompt parsing in `search-catalog.ts`
- hybrid scoring in `search-engine.ts`
- inventory persistence in `job_postings`
- jobs panel and API integration through `search.ts` and `/api/v1/jobs/search`

That flow worked for basic retrieval, but it still leaned heavily on string matching and partial metadata.

## New flow

The v2 engine introduces a metadata-first retrieval pipeline in `packages/jobs-domain/src/job-search-retrieval/`:

1. parse query
2. normalize filters
3. map inventory into a canonical job record shape
4. apply hard filters against canonical metadata
5. run lexical retrieval over title/company/team/skills/description
6. run semantic reranking on the narrowed candidate set
7. widen deterministically when exact matches are sparse
8. build explanations, diagnostics, and user-facing messaging

This engine is feature-flagged behind `JOB_SEARCH_RETRIEVAL_V2_ENABLED` so the active route can be upgraded safely.

## Canonical schema

The canonical mapping layer derives a stable search shape from persisted job DTOs plus raw payload JSON:

- title, title family, title cluster, title tokens
- normalized company metadata
- structured location fields:
  - city
  - state
  - state code
  - metro
  - country
  - remote / hybrid / onsite flags
- seniority
- employment type
- compensation min/max/currency/period
- required vs preferred skills
- team / department
- eligibility hints such as sponsorship and clearance
- normalized description text and searchable chunks

The canonical layer is intentionally in code first so retrieval quality can improve immediately without blocking on a full storage migration.

## Widening strategy

Widening is deterministic and user-visible.

Current v2 order:

- location: city/state -> metro -> state -> country -> remote fallback
- recency: exact window -> last 3 days -> last 7 days
- title: exact normalized title -> title family -> broader role cluster
- compensation: exact threshold -> 10 percent relaxation when the minimum is not strict -> unknown-compensation bucket

Exact and widened results are tracked separately in the response contract.

## Observability

The v2 engine records and returns:

- normalized query summary
- exact and fallback counts
- stage counts by retrieval phase
- widening steps
- zero-result reasons
- latency breakdown by stage
- engine version

Database observability now persists richer job search event JSON in `job_search_events`, in addition to the previous prompt/result metadata.

## Test coverage

The new test plan covers:

- parser normalization
- recency distinctions
- compensation parsing
- deterministic workplace filtering
- metadata-first Austin / Texas / remote matching
- team and skill ranking
- widening behavior
- zero-result UX
- feature-flagged integration

See [docs/testing/job-search-retrieval-test-plan.md](/Users/stefanocaruso/Desktop/career-ai-job-search/docs/testing/job-search-retrieval-test-plan.md).

## Rollout strategy

- Legacy retrieval remains the default until `JOB_SEARCH_RETRIEVAL_V2_ENABLED` is turned on.
- The route contract stays backward compatible by keeping the existing jobs panel payload and adding richer optional diagnostics.
- Because raw payload JSON is already persisted, the new engine can run without a blocking re-ingestion step, though future backfill work would still improve metadata quality.
