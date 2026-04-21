# Career AI

Career AI is a Next.js 16 application with package-style modules under `packages/`, optional sibling services, and a handful of standalone npm workspaces for candidate identity, recruiter search, job search, chat, Career ID verification, access control, recruiter marketplace flows, and autonomous apply.

## Repository Shape

- `app/`: Next.js routes, server actions, and UI.
- `packages/`: package-style domain modules for chat, jobs, recruiter read models, access requests, identity, Career ID, agent runtime, autonomous apply, persistence, and security. Most are imported directly through the repo TypeScript alias rather than published as standalone npm packages.
- `lib/`: auth, tracing, application-profile helpers, A2A helpers, notification adapters, and integration clients.
- `db/migrations/`: Postgres schema for durable app state.
- `services/api-gateway` and `services/pdf-extractor`: optional Hono services kept in the same repo.
- `package.json` workspaces currently cover the sibling services plus standalone packages such as `pdf-signature-verifier`, `a2a-protocol`, and schema/tooling packages.
- `scripts/run-autonomous-apply-worker.ts`: long-running autonomous-apply worker entrypoint.

## Runtime Surfaces

- `/api/chat`: homepage chat entrypoint. It routes to the homepage assistant, recruiter candidate search, or the LangGraph job seeker agent depending on persona and message intent.
- `/api/v1/jobs/*` and `/jobs`: live and persisted job search, retrieval, validation, detail, and apply-click flows.
- `/api/v1/employer/candidates/*`, `/api/v1/recruiters/*`, `/api/v1/employer-partners/*`, and `/employer/*`: recruiter sourcing, recruiter-marketplace access, scoped recruiter chat, Career ID matching, candidate trace, and private-access flows.
- `/api/v1/access-requests/*`, `/api/v1/share-profiles/*`, `/api/v1/talent-identities/*`, `/access-requests/*`, and `/share/[token]`: candidate privacy, recruiter review requests, public share links, and recruiter private-access retrieval.
- `/api/v1/me/application-profiles/*`, `/api/v1/me/notification-preferences`, and `/account/settings`: reusable ATS-specific application profiles, resume uploads, and candidate notification preferences.
- `/api/v1/career-builder/*`, `/agent-build`, and `/wallet`: Career Builder profile, evidence, phase workflows, and the current wallet placeholder surface.
- `/api/v1/career-id/verifications/*` and `/api/v1/career-id/profile`: government-ID verification session, status, webhook, retry, and profile-summary routes.
- `/api/internal/agents/*`: internal candidate, recruiter, and verifier agent endpoints.
- `/api/a2a/agents/*`: external A2A discovery, card, and agent invocation endpoints.
- `/api/v1/apply-runs/*` and `/account/apply-runs`: autonomous-apply run creation and status views.

## Persistence And Storage

- Postgres is optional but required for durable auth, onboarding, talent identity and privacy state, application profiles, jobs snapshots and events, chat metadata, access requests and review tokens, recruiter marketplace records, A2A protocol records, audit records, Career ID state, and autonomous-apply runs.
- Chat falls back to `.artifacts/chat/state.json` and `.artifacts/chat/files` when `DATABASE_URL` is absent.
- Artifact/blob storage uses the local filesystem by default and switches to S3 when `CAREER_AI_BLOB_STORAGE_DRIVER=s3` or bucket settings are present.
- The application-profile editor also keeps browser-local cached profiles and drafts; durable server-side profile persistence still depends on Postgres.
- Several domains still rely on in-memory stores for at least part of their state, including credential details, verification records, artifact metadata, recruiter share-profile summaries, and verification-domain caches.

## Current Integrations

- NextAuth with Google OAuth plus first-party email/password credentials.
- OpenAI for homepage assistant replies, job seeker agent web search, chat audio transcription, and optional `api-gateway` claim-verification content checks.
- Braintrust for optional tracing and observed-span lookup when `BRAINTRUST_API_KEY` is configured.
- Persona for Career ID government-ID verification.
- Job-feed ingestion from Greenhouse, Lever, Ashby, Workday JSON feeds, Workable XML, and generic JSON feeds.
- Optional Resend and Twilio delivery for access-request notifications.
- Optional `api-gateway` plus `pdf-extractor` verification path for Career Builder claim verification.

## Background Execution

- Jobs feed refresh is request-triggered; there is no scheduler in this repo.
- Chat memory extraction runs inline after assistant persistence in DB-backed chat mode.
- Autonomous apply creates durable queued runs and executes inline by default. The same worker loop can also be started explicitly with `npm run worker:apply` or `npm run dev:apply-worker`.

## Run Locally

```bash
npm install
npm run db:migrate
npm run dev
```

Copy `.env.example` to `.env.local` and enable only the integrations you need for the surface you are testing. The jobs, A2A, auth, and autonomous-apply paths all have optional environment-dependent behavior.

## Docs

- [Docs index](./docs/README.md)
- [Current-state system architecture](./docs/architecture/current-state-agent-platform.md)
- [Truth audit summary](./docs/architecture/truth-audit-summary.md)
- [Job seeker LangGraph agent](./docs/architecture/job-seeker-langgraph-agent.md)
- [Job search retrieval](./docs/architecture/job-search-retrieval.md)
- [Chat persistence and checkpoints](./docs/architecture/chat-persistence-memory-checkpoints.md)
- [Chat attachments](./docs/chat-attachments.md)
- [Autonomous apply system](./docs/architecture/autonomous-apply-system.md)
- [Autonomous apply ops runbook](./docs/ops/autonomous-apply-workday-runbook.md)
- [A2A and internal agent boundary](./docs/full-a2a-protocol.md)
