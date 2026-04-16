# Job Search Retrieval Gap Report

## Current flow before this change

- Natural-language job search parsing lived in [packages/jobs-domain/src/search-catalog.ts](/Users/stefanocaruso/Desktop/career-ai-job-search/packages/jobs-domain/src/search-catalog.ts).
- Ranking and mixed lexical/semantic retrieval lived in [packages/jobs-domain/src/search-engine.ts](/Users/stefanocaruso/Desktop/career-ai-job-search/packages/jobs-domain/src/search-engine.ts).
- Inventory was persisted in `job_postings` and `job_sources` through [packages/persistence/src/job-posting-repository.ts](/Users/stefanocaruso/Desktop/career-ai-job-search/packages/persistence/src/job-posting-repository.ts) and migrations [db/migrations/0002_persist_job_posts.sql](/Users/stefanocaruso/Desktop/career-ai-job-search/db/migrations/0002_persist_job_posts.sql) plus [db/migrations/0004_jobs_search_platform.sql](/Users/stefanocaruso/Desktop/career-ai-job-search/db/migrations/0004_jobs_search_platform.sql).
- Search was already exposed through [app/api/v1/jobs/search/route.ts](/Users/stefanocaruso/Desktop/career-ai-job-search/app/api/v1/jobs/search/route.ts) and the jobs panel wrapper in [packages/jobs-domain/src/search.ts](/Users/stefanocaruso/Desktop/career-ai-job-search/packages/jobs-domain/src/search.ts).

## Inventory shape before this change

- Jobs were not raw text only. The existing DTO already stored normalized title/company, workplace type, salary text, canonical URLs, trust metadata, validation status, and raw payload JSON.
- Structured fields that already existed:
  - title
  - normalized title
  - company
  - normalized company
  - location as a single string
  - workplace type
  - salary text only
  - posted/updated timestamps
  - department
  - trust and validation metadata
- Important structured metadata that was still missing or only partially derivable:
  - location city/state/metro/country breakdown
  - numeric compensation min/max/currency/period
  - required vs preferred skills
  - explicit team normalization beyond `department`
  - sponsorship and clearance flags
  - canonical title family / broader role cluster
  - explicit exact-vs-fallback result buckets

## Failure points before this change

- Query parsing was still string-heavy and clause-based, which made location, compensation, skill, and team extraction brittle.
- Hard filters were mixed with ranking logic instead of running strictly on a canonical metadata layer first.
- Location filtering depended mostly on string containment instead of canonical city/state/metro matching.
- Compensation search relied on salary text parsing when available, with no canonical compensation object and no explicit known-vs-unknown compensation buckets.
- Widening existed, but only as a shallow fallback marker, not a user-visible deterministic sequence with exact and widened buckets.
- Observability logged prompt/result basics, but not enough detail to explain why a known job did or did not match.

## Re-ingestion / backfill assessment

- Full re-ingestion is not required for the v2 engine because raw payload JSON already exists for canonical mapping at retrieval time.
- Metadata backfill would still improve quality for:
  - required vs preferred skills
  - sponsorship / clearance
  - precise compensation
  - company aliases
  - richer team/org fields
- This change adds a mapping layer first, so the rollout does not block on a one-time backfill.
