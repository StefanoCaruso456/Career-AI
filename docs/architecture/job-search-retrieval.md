# Job Search Retrieval

The jobs domain currently ships two retrieval paths behind one entrypoint.

## Entry Points

- `packages/jobs-domain/src/search.ts` is the public wrapper.
- `JOB_SEARCH_RETRIEVAL_V2_ENABLED=true` switches search to `packages/jobs-domain/src/job-search-retrieval/service.ts`.
- Without that flag, search uses the legacy `search-catalog.ts` plus `search-engine.ts` path.

The same wrapper also handles deterministic latest-jobs browsing and jobs-panel response shaping.

## Data Source

- If `DATABASE_URL` is not configured, the jobs domain searches live feed snapshots only.
- If `DATABASE_URL` is configured, search prefers persisted feed snapshots from Postgres.
- `refresh: true` can trigger a live refresh before search, but the refresh is still request-triggered. There is no scheduler in this repo.

Supported feed families in `packages/jobs-domain/src/service.ts`:

- Greenhouse
- Lever
- Ashby
- Workday JSON feeds
- generic JSON feeds
- Workable XML feeds

## Legacy Path

The legacy path is still active when the v2 flag is off.

- Query parsing lives in `search-catalog.ts`.
- Ranking lives in `search-engine.ts`.
- The search engine combines structured filtering, lexical matching, semantic-style scoring, dedupe, and widening heuristics.
- It produces `JobSearchRetrievalResultDto` plus jobs-rail cards and user-facing empty-state text.

## V2 Path

The v2 path is present in code and activated only by `JOB_SEARCH_RETRIEVAL_V2_ENABLED`.

Its pipeline is:

1. parse the raw request
2. normalize filters
3. map persisted or live jobs into canonical records
4. apply hard filters
5. rerank candidates
6. widen deterministically when exact matches are sparse
7. build explanations, query summaries, and observability data

Important modules:

- `query-parser.ts`
- `filter-normalizer.ts`
- `canonical-mapper.ts`
- `retrieval-engine.ts`
- `reranker.ts`
- `explainer.ts`
- `observability.ts`

## Persistence And Events

When the database is configured:

- jobs inventory is persisted in `job_sources` and `job_postings`
- validation output can be recorded in `job_validation_events`
- search activity can be recorded in `job_search_events`
- apply-click behavior records `job_apply_click_events`

If the database is absent, the search still works, but those durable records are unavailable.

## Relation To Chat And Agents

- `/api/chat` and the job-seeker agent both call the same jobs-domain search surface.
- “latest jobs” prompts can route to deterministic browse behavior instead of a free-form search.
- The job-seeker agent may also bypass the internal inventory and use `search_web` when the request is about current external market information.

## Current Limits

- Feed refresh is request-triggered, not scheduled.
- The live-inventory result quality still depends on source freshness and the current stored metadata.
- Both paths exist in code, so documentation must account for the legacy path and the v2 path at the same time.
