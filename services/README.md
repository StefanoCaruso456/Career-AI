# services/ — Private backend services

Each service is a bounded deployable with its own API surface, persistence, and lifecycle. Services depend on:

- `@career-protocol/*` packages for protocol types and reference implementations
- `packages/*` private business logic packages
- `infra/*` shared infra primitives

## Services

| Service | Phase | Responsibility |
|---|---|---|
| [`identity-service`](./identity-service) | T1 | DID issuance, ID.me integration, one-DID-per-human enforcement, first Identity VC |
| [`issuer-service`](./issuer-service) | T2 | Builds and signs VCs from verified claims; pluggable issuance hooks |
| [`wallet-service`](./wallet-service) | T1/T2 | Encrypted VC storage, per-user key lifecycle, presentation generation, standing consent |
| [`verification-orchestrator`](./verification-orchestrator) | T2 | Routes claims through verification methods (human / agent / sync / rules) |
| [`endorsement-service`](./endorsement-service) | T3 | P2P vouching, endorser identity checks, collusion signal emission |
| [`sync-service`](./sync-service) | T4 | Runs payroll/HRIS adapters, triggers issuance |
| [`candidate-agent-service`](./candidate-agent-service) | T5 | Candidate-side agent runtime |
| [`employer-agent-service`](./employer-agent-service) | T5 | Employer-side agent runtime; backend for Career-AI Employer Agent Sourcer |
| [`a2a-gateway`](./a2a-gateway) | T5 | DID-authenticated agent message routing, rate limits, audit, future credit accounting |
| [`status-service`](./status-service) | T2 | StatusList2021 host for credential revocation |

## Status

Phase T0 — service folders created, implementations begin per the phase roadmap.
