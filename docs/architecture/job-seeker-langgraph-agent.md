# Job Seeker LangGraph Agent

## Architecture summary

The Job Seeker chat path now uses a dedicated LangGraph runtime instead of the previous prompt-plus-heuristic shortcut. The runtime is responsible for:

- observing the latest user request and recent conversation state
- classifying intent explicitly
- selecting an approved tool through a typed planning step
- executing the tool through a narrow allowlist
- evaluating result quality before responding
- broadening once or twice when results are weak or empty
- returning a grounded chat message plus a structured jobs rail payload

The implementation lives in `packages/job-seeker-agent/src` and is wired into `app/api/chat/route.ts` for the job seeker persona.

## Graph nodes

### `observe_context`

- normalizes the latest user query
- finds the most recent prior jobs request in the conversation
- initializes trace data

### `classify_intent`

- uses deterministic heuristics first
- falls back to a structured model classification when needed
- emits one of:
  - `job_search`
  - `job_refinement`
  - `profile_or_career_id`
  - `application_help`
  - `general_chat`
  - `unsupported`

### `plan_next_action`

- enforces tool use for `job_search` and `job_refinement`
- loads Career ID context first when the user asks for profile-aligned jobs
- normalizes the search request into structured filters
- prepares typed tool arguments

### `execute_tool`

- calls one approved tool:
  - `searchJobs`
  - `getJobById`
  - `findSimilarJobs`
  - `getUserCareerProfile`
- stores the raw and normalized tool result

### `evaluate_tool_result`

- scores the latest search result as `strong`, `acceptable`, `weak`, or `empty`
- considers result count, top relevance score, title alignment, location alignment, and skill overlap

### `fallback_or_clarify`

- broadens safely when possible
- asks a short targeted clarification when broadening would drift too far
- never loops indefinitely

### `respond`

- produces the final grounded assistant text
- returns a structured `jobsPanel` payload for the jobs rail when search results exist
- keeps non-search requests off the jobs rail

## State schema

The LangGraph state tracks:

- `messages`
- `userQuery`
- `normalizedQuery`
- `intent`
- `intentConfidence`
- `extractedFilters`
- `selectedTool`
- `toolArgs`
- `toolResult`
- `normalizedToolResult`
- `lastSearchResult`
- `resultQuality`
- `loopCount`
- `maxLoops`
- `shouldTerminate`
- `terminationReason`
- `responsePayload`
- `debugTrace`
- `profileContext`
- `priorJobSearchQuery`
- `conversationId`
- `ownerId`

This keeps execution inspectable and debuggable across the full job-search loop.

## Routing and edge logic

- `START -> observe_context -> classify_intent -> plan_next_action`
- `plan_next_action -> execute_tool` when a tool is selected
- `plan_next_action -> respond` when no tool is needed
- `execute_tool -> plan_next_action` after `getUserCareerProfile`
- `execute_tool -> evaluate_tool_result` after search-style tools
- `execute_tool -> respond` on unrecoverable tool failure
- `evaluate_tool_result -> respond` for `strong`, `acceptable`, or max-loop termination
- `evaluate_tool_result -> fallback_or_clarify` for `weak` or `empty`
- `fallback_or_clarify -> execute_tool` after safe broadening
- `fallback_or_clarify -> respond` when clarification is required

## Loop strategy

- `maxLoops = 2`
- initial search attempt is followed by up to two bounded refinements
- broadening is deterministic:
  - relax conflicting location + remote constraints
  - relax seniority
  - trim skill constraints
  - clear explicit company filters
  - broaden narrow role families when safe

If no safe broadening remains, the agent asks a short clarification instead of drifting.

## Tool selection strategy

### `searchJobs`

- default tool for `job_search`
- default tool for `job_refinement`
- consumes structured filters instead of raw prompt text only

### `getUserCareerProfile`

- called first for profile-aligned prompts such as:
  - `find jobs aligned with my background`
  - `find jobs for me`

### `getJobById`

- available for job-detail lookups

### `findSimilarJobs`

- available for “more like this job” flows

## Prompt wiring

The runtime system prompt from the implementation brief is stored in:

- `packages/job-seeker-agent/src/prompts.ts`

That prompt is reused for:

- intent classification
- planning / tool selection
- grounded response composition
- non-search general responses

## UI output contract

The jobs rail now receives richer grounded data through `JobsPanelResponseDto`:

- `assistantMessage`
- `agent`
  - intent
  - confidence
  - selected tool
  - result quality
  - loop count
  - termination reason
- `debugTrace`
- `query`
- `jobs`
- `rail.cards`
  - `jobId`
  - `title`
  - `company`
  - `location`
  - `workplaceType`
  - `salaryText`
  - `applyUrl`
  - `summary`
  - `matchReason`
  - `relevanceScore`

The job seeker rail now renders the match reason and job metadata instead of only title and company.

## Observability and logging

Each run accumulates a `debugTrace` array with:

- `step`
- `summary`
- `timestamp`
- structured `data`

The trace captures:

- normalized user query
- intent decision
- selected tool
- tool result counts
- result quality
- loop count
- termination reason

This trace is returned in the jobs panel payload for inspection and future logging sinks.

## Current limitations

- `findSimilarJobs` and `getJobById` are implemented as foundations, but the highest-confidence path remains `searchJobs`
- clarification handling is intentionally narrow and deterministic, not freeform
- broadening heuristics are safe but still conservative
- the underlying retrieval tool still uses the current jobs-domain matching logic; deeper retrieval/ranking improvements should happen inside `searchJobs` next

## Recommended next step

Implement the dedicated `searchJobs` retrieval layer over the full live jobs inventory so the LangGraph runtime can call a stronger ranking engine without changing the orchestration contract. The current graph, tool interfaces, UI payload, and debug trace are already shaped for that plug-in upgrade.
