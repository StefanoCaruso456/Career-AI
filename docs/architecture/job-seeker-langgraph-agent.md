# Job Seeker LangGraph Agent

The job-seeker agent is a real LangGraph runtime used by `/api/chat` for job-seeker search flows. It does not power the internal or external agent endpoints.

## Entry Point

- Route: `app/api/chat/route.ts`
- Service: `packages/job-seeker-agent/src/service.ts`
- Runtime: `packages/job-seeker-agent/src/runtime.ts`

`/api/chat` chooses the job-seeker agent when the active persona is job seeker and the message should go through the jobs-focused path. If that path is not selected, chat falls back to the homepage assistant or recruiter search behavior.

## Graph

The graph is bounded and synchronous:

1. `observe_context`
2. `classify_intent`
3. `plan_next_action`
4. `execute_tool`
5. `evaluate_tool_result`
6. `fallback_or_clarify`
7. `respond`

`maxLoops` is `2`, so the agent can broaden or retry only a small number of times before it must respond.

## Query Routing

Before tool execution, the runtime classifies what kind of evidence it needs. The routing layer can choose between:

- internal platform job data
- user-specific profile data
- current external information
- action workflow execution
- static knowledge

That distinction matters because the agent has both internal jobs tools and a live web-search tool.

## Tools

The current tool registry is:

- `browseLatestJobs`
- `findSimilarJobs`
- `getJobById`
- `getUserCareerProfile`
- `searchJobs`
- `search_web`

`search_web` is a real OpenAI Responses API tool call that uses `web_search_preview`. It is intended for current public-market information rather than the internal jobs catalog.

## Models And Outputs

- Structured planning and response steps use `@langchain/openai` and `ChatOpenAI`.
- The default web-search model comes from `JOB_SEEKER_AGENT_WEB_SEARCH_MODEL`.
- The final response can return a `JobsPanelResponseDto` with grounded jobs cards and diagnostics.
- The runtime also builds a `debugTrace` array for inspection.

## Failure And Fallback Behavior

- If a grounded external-search step fails when fresh public information is required, the route returns a grounded failure message instead of pretending the search succeeded.
- If a jobs lookup fails on the agent path, `/api/chat` can fall back to deterministic jobs-panel search behavior.
- If neither of those conditions applies, the route falls back to the homepage assistant.

## Observability

- Top-level tracing span: `workflow.job_seeker_agent.run`
- The graph keeps explicit state for intent, selected tool, tool args, tool output, result quality, termination reason, and response payload.

## Current Limits

- The runtime is request-scoped. There is no background worker, queue, or autonomous continuation.
- `maxLoops=2` keeps broadening conservative.
- The agent only handles the job-seeker chat path; recruiter search and verifier flows live elsewhere.
