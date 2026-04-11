# Job Search Retrieval Service

## Architecture summary

The job seeker runtime now calls a dedicated retrieval layer that treats jobs as structured entities instead of generic chat text. The service:

- accepts a raw natural-language request plus structured filters when available
- normalizes the request into typed retrieval signals
- loads the live jobs inventory
- applies hard validation and strict filters first
- scores the remaining jobs with a hybrid ranker
- broadens once when the initial search is over-constrained
- returns grounded, UI-ready results plus debug metadata

## Typed input

The shared contracts define a retrieval-oriented input model through:

- `searchJobsToolInputSchema`
- `jobSearchFiltersSchema`
- `jobSearchQuerySchema`

Supported fields include:

- `rawQuery`
- `normalizedRoles`
- `skills`
- `locations`
- `remotePreference`
- `seniority`
- `employmentType`
- `industries`
- `salaryMin`
- `salaryMax`
- `profileContext`
- `careerIdContext`
- `excludeTerms`
- `limit`
- `offset`

## Typed output

The retrieval layer returns `jobSearchRetrievalResultSchema` with:

- `results`
- `totalCandidateCount`
- `returnedCount`
- `queryInterpretation`
- `appliedFilters`
- `rankingSummary`
- `resultQuality`
- `fallbackApplied`
- `debugMeta`

Each result record includes grounded job fields, match reasons, relevance score, parsed salary range, and a ranking breakdown.

## Query normalization

Normalization combines the current structured `JobSearchQueryDto` with prompt parsing. The service derives:

- normalized role families
- adjacent roles
- company terms
- location terms
- remote / hybrid / onsite preference
- seniority
- employment type
- industry tags
- salary bounds
- exclusion terms
- semantic themes
- profile signals used for ranking boosts

Generic “find jobs for me” prompts stay broad, while explicit constraints remain explicit.

## Retrieval methodology

The retrieval pass uses three layers:

1. Structured gating
- removes invalid, expired, stale, duplicate, excluded, wrong-company, wrong-location, wrong-remote-only, wrong-salary, and wrong-employment-type jobs

2. Lexical retrieval
- exact and near-exact phrase overlap for title, role, company, skill, and location language

3. Semantic-style retrieval
- concept-vector similarity built from role-family aliases, adjacent roles, themes, description text, profile signals, and industry tags

The candidate sets are merged and then ranked.

## Ranking methodology

Ranking is explicit and inspectable. Each result gets a `rankingBreakdown` with:

- `titleMatchScore`
- `lexicalScore`
- `semanticScore`
- `skillOverlapScore`
- `locationScore`
- `remotePreferenceScore`
- `seniorityScore`
- `employmentTypeScore`
- `industryScore`
- `profileAlignmentScore`
- `freshnessScore`
- `trustScore`
- `mismatchPenalty`
- `finalScore`

The final score uses dynamic weights so explicit user constraints matter more when present.

## Fallback behavior

When the initial pass is `weak` or `empty`, the service broadens once in a deterministic order:

- relax location for remote-only searches
- relax seniority
- trim long skill lists
- relax employment type
- relax salary bounds
- broaden exact roles into adjacent role families

The applied fallback is returned in `fallbackApplied` and mirrored in `debugMeta`.

## Result quality

The tool labels each search as:

- `strong`
- `acceptable`
- `weak`
- `empty`

This label is based on final scores, top-match alignment, and how many genuinely aligned jobs survived the threshold.

## Observability

The retrieval result exposes:

- `queryInterpretation`
- `appliedFilters`
- candidate counts after filtering, lexical scoring, semantic scoring, and merging
- duplicate / invalid / stale counts
- fallback metadata
- ranking weights and top ranking signals
- total latency

This makes it possible to explain why a search returned what it returned.

## Current limitations

- The semantic layer is currently an in-process concept-vector scorer, not an external embedding index yet.
- Inventory fields are still constrained by the existing normalized job schema; full responsibilities / qualifications / skills extraction is still partial.
- Location broadening is string-based and does not yet use geographic proximity.
- Salary filtering depends on parseable salary text being present.

## Recommended next improvements

1. Add a persistent vector index over title + summary + full description text.
2. Normalize more structured fields at ingestion time: skills, seniority, industry, salary, remote type.
3. Add geographic normalization for metro / state / nearby matching.
4. Add offline relevance evaluation datasets for representative job seeker prompts.
5. Feed retrieval debug metrics into product analytics so weak-result prompts are easy to spot and improve.
