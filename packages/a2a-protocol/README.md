# @career-protocol/a2a-protocol

JSON message schemas, routing rules, and DID-based authentication for Career Protocol Agent-to-Agent communication.

## Message types (draft)

| Type | Direction | Purpose |
|---|---|---|
| `Introduction` | employer → candidate | Opens a conversation. Must include recruiter role details and proof of real role. |
| `CredentialRequest` | employer → candidate | Requests specific credentials (by type + optional criteria). |
| `CredentialPresentation` | candidate → employer | Responds with a Verifiable Presentation. |
| `ClarificationRequest` | either direction | Asks a specific question about the role or candidate. |
| `ClarificationResponse` | either direction | Answers. |
| `InterviewOffer` | employer → candidate | Proposes interview scheduling. |
| `Decline` | either direction | Ends the conversation with a reason. |
| `EscalateToHuman` | either direction | Signals the agent is handing off to its principal. |

## Transport

- **Sync**: HTTPS POST to a well-known A2A endpoint listed in the agent's DID document
- **Async**: event bus (for internal platform traffic) — external agents always use HTTPS

## Authentication

Every A2A message is signed by the sending agent's DID using JWS. Receivers verify via `@career-protocol/did-resolver`. The `a2a-gateway` service enforces rate limits, audit logging, and (future T7) recruiter credit accounting.

## Not in scope for this package

- The agent runtime itself (lives in `career-ledger/services/candidate-agent-service` and `employer-agent-service`)
- Negotiation strategy (private, lives in `career-ledger/packages/negotiation-policy`)
- Agent personas (private, lives in `career-ledger/packages/agent-personas`)

This package only defines the wire format, schemas, and auth rules — the open-source "grammar" that any compliant agent can speak.
