# Full A2A Protocol

## Employer to Recruiter flow

The employer candidate-search route now emits a protocol-grade A2A envelope and dispatches through the recruiter A2A handler used by `/api/a2a/agents/recruiter`. The outbound gateway sender is `careerai.gateway.employer_search`, the receiver is `careerai.agent.recruiter`, and the same `messageId`, `requestId`, `traceId`, and run lineage are written to tracing spans and durable protocol tables.

## Durable protocol records

The runtime now persists:

- `agent_messages`
- `agent_runs`
- `agent_handoffs`
- `agent_task_events`

These records store sender and receiver identities, request and message IDs, trace correlation, run lineage, lifecycle status, handoff metadata, and span names.

## Lifecycle and tracing

The recruiter A2A flow emits and persists:

- `a2a.message.created`
- `a2a.message.sent`
- `a2a.message.received`
- `a2a.task.accepted`
- `a2a.task.running`
- `a2a.task.completed`
- `a2a.task.failed`
- `a2a.response.sent`

Each span and persisted record carries the protocol identifiers needed to reconstruct the flow:

- `messageId`
- `requestId`
- `runId`
- `parentRunId`
- `traceId`
- `senderAgentId`
- `receiverAgentId`

## Inspection endpoints

Admin inspection routes are available at:

- `GET /api/v1/admin/a2a/messages/:messageId`
- `GET /api/v1/admin/a2a/runs/:runId`
- `GET /api/v1/admin/a2a/handoffs?parentRunId=:runId`
- `GET /api/v1/admin/a2a/requests/:requestId/events`
