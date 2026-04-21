# A2A And Internal Agent Boundary

The repo exposes both internal agent endpoints and external A2A-compatible endpoints. They share the same underlying agent definitions and tool allowlists, but their auth and protocol envelopes differ.

## Internal Agent Endpoints

- `POST /api/internal/agents/candidate`
- `POST /api/internal/agents/recruiter`
- `POST /api/internal/agents/verifier`

Internal endpoints:

- require `internal_service_bearer` auth
- reserve per-route quota
- build an `AgentContext` and `RunContext`
- call `generateHomepageAssistantReplyDetailed(..., { runtimeMode: "bounded_loop" })`
- filter the shared tool registry to the route’s allowed tools

## External A2A Endpoints

- `GET /api/a2a/agents`
- `GET /api/a2a/agents/[agentType]/card`
- `POST /api/a2a/agents/candidate`
- `POST /api/a2a/agents/recruiter`
- `POST /api/a2a/agents/verifier`

External endpoints:

- are disabled unless `EXTERNAL_A2A_ENABLED=true`
- require bearer tokens described by `EXTERNAL_AGENT_AUTH_TOKENS`
- validate sender identity against the requested target agent
- emit A2A protocol lifecycle events

## Shared Registry

The internal registry in `lib/internal-agents/registry.ts` is the source of truth. The external registry is derived from it in `lib/a2a/registry.ts`.

Defined agent types:

- candidate
- recruiter
- verifier

Allowed tool sets:

- candidate: `search_jobs`, `get_career_id_summary`, `get_claim_details`, `get_verification_record`, `list_provenance_records`
- recruiter: candidate tools plus `search_candidates`
- verifier: `get_claim_details`, `get_verification_record`, `list_provenance_records`, `get_career_id_summary`

## Protocol Persistence

When `DATABASE_URL` is configured, A2A protocol state is persisted to:

- `agent_messages`
- `agent_runs`
- `agent_handoffs`
- `agent_task_events`

Those writes are performed by `lib/a2a/protocol-runtime.ts` through `packages/persistence/src/agent-protocol-repository.ts`.

When the database is not configured, the routes still execute, but protocol persistence is skipped.

## Lifecycle Events

The external A2A routes emit protocol events such as:

- `a2a.message.received`
- `a2a.task.accepted`
- `a2a.task.running`
- `a2a.task.completed`
- `a2a.task.failed`
- `a2a.response.sent`

The recruiter product-search route also emits A2A-style handoff and protocol events when it delegates to the recruiter boundary in-process.

## Recruiter Special Case

The recruiter agent supports two operations:

- `respond`: bounded-loop homepage-assistant execution with recruiter-safe tools
- `candidate_search`: direct `searchEmployerCandidates` execution

That means not every A2A request is an LLM/tool loop.

## W3C Presentation Context

Verifier routes can accept W3C presentation envelope metadata and summarize it through `defaultW3CPresentationAdapter`. The summary is advisory context for the verifier agent, not proof that external verification has already happened.

## Current Limits

- There is no general asynchronous broker or cross-agent workflow engine.
- The product search handoff invokes the recruiter A2A handler in-process; it does not make a network hop to itself.
- Internal and external agent routes are request/response endpoints, not durable autonomous workers.
