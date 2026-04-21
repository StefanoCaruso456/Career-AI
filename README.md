# Career AI

Career AI is a Next.js 16 application with supporting workspace packages for candidate identity, recruiter search, job search, chat, Career ID verification, and autonomous apply.

## Repository Shape

- `app/`: Next.js routes, server actions, and UI.
- `packages/`: domain modules for chat, jobs, recruiter read models, Career ID, agent runtime, autonomous apply, persistence, and security.
- `lib/`: auth, tracing, A2A helpers, notification adapters, and integration clients.
- `db/migrations/`: Postgres schema for durable app state.
- `services/api-gateway` and `services/pdf-extractor`: optional sibling services kept in the same repo.
- `scripts/run-autonomous-apply-worker.ts`: long-running autonomous-apply worker entrypoint.

## Runtime Surfaces

- `/api/chat`: homepage chat entrypoint. It routes to the homepage assistant, recruiter candidate search, or the LangGraph job seeker agent depending on persona and message intent.
- `/api/v1/jobs/*` and `/jobs`: live and persisted job search, retrieval, validation, detail, and apply-click flows.
- `/api/v1/employer/candidates/search` and `/employer/candidates`: recruiter search and candidate trace flows.
- `/api/v1/career-builder/*` and `/agent-build`: Career Builder profile, evidence, and phase workflows.
- `/api/v1/career-id/verifications/*`: government-ID verification session, status, webhook, and retry routes.
- `/api/internal/agents/*`: internal candidate, recruiter, and verifier agent endpoints.
- `/api/a2a/agents/*`: external A2A discovery, card, and agent invocation endpoints.
- `/api/v1/apply-runs/*` and `/account/apply-runs`: autonomous-apply run creation and status views.

## Persistence And Storage

- Postgres is optional but required for durable auth, onboarding, jobs snapshots, chat metadata, A2A protocol records, audit records, Career ID state, recruiter projections, and autonomous-apply runs.
- Chat falls back to `.artifacts/chat/state.json` and `.artifacts/chat/files` when `DATABASE_URL` is absent.
- Artifact/blob storage uses the local filesystem by default and switches to S3 when `CAREER_AI_BLOB_STORAGE_DRIVER=s3` or bucket settings are present.
- Several domains still rely on in-memory stores for at least part of their state, including credential details, verification records, artifact metadata, share-profile summaries, and verification-domain caches.

## Current Integrations

- Google OAuth through NextAuth.
- OpenAI for homepage assistant replies, job seeker agent web search, and chat audio transcription.
- Braintrust for optional tracing and observed-span lookup when `BRAINTRUST_API_KEY` is configured.
- Persona for Career ID government-ID verification.
- Job-feed ingestion from Greenhouse, Lever, Ashby, Workday JSON feeds, Workable XML, and generic JSON feeds.
- Optional Resend and Twilio delivery for access-request notifications.
- Optional `api-gateway` plus `pdf-extractor` verification path for Career Builder claim verification.

## Background Execution

- Jobs feed refresh is request-triggered; there is no scheduler in this repo.
- Chat memory extraction runs inline after assistant persistence in DB-backed chat mode.
- Autonomous apply creates durable queued runs and executes inline by default. The same worker loop can also be started explicitly with `npm run worker:apply` or `npm run dev:apply-worker`.

## Docs

- [Docs index](./docs/README.md)
- [Current-state system architecture](./docs/architecture/current-state-agent-platform.md)
- [Job seeker LangGraph agent](./docs/architecture/job-seeker-langgraph-agent.md)
- [Job search retrieval](./docs/architecture/job-search-retrieval.md)
- [Chat persistence and checkpoints](./docs/architecture/chat-persistence-memory-checkpoints.md)
- [Autonomous apply system](./docs/architecture/autonomous-apply-system.md)
- [A2A and internal agent boundary](./docs/full-a2a-protocol.md)
- [Truth audit summary](./docs/architecture/truth-audit-summary.md)
