# Career AI

Career AI is a trust-first recruiting platform built around a persisted **Career ID**. It combines candidate identity, recruiter workflows, consented data access, job discovery, and agent-backed automation in one codebase.

## Implemented Today

- Candidate-facing Career ID, onboarding, account, settings, and shared profile flows
- Recruiter-safe candidate summaries and access-request workflows
- Job discovery, retrieval, and autonomous apply foundation
- Internal and external agent boundaries, including A2A-compatible endpoints
- Durable persistence, audit trails, and supporting verification services

## Architecture

This repo is centered on a Next.js app, with shared domain packages and two supporting HTTP services:

- `services/api-gateway`: ledger routes and document-verification workflows
- `services/pdf-extractor`: isolated PDF parsing service

Autonomous apply is currently implemented for **Workday only**. Other targets may be detected, but they are not automated in this phase.

## Run Locally

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Useful optional dev commands:

```bash
npm run dev:gateway
npm run dev:extractor
npm run dev:apply-worker
```

For local setup, use `.env.example` as the source of truth. In practice you will usually need:

- `DATABASE_URL`
- Auth config (`NEXTAUTH_URL` or `AUTH_URL`, `NEXTAUTH_SECRET` or `AUTH_SECRET`, Google OAuth vars)
- `OPENAI_API_KEY` for LLM-backed features
- feature-specific env vars for jobs, A2A, or autonomous apply when testing those paths

## Repo Layout

- `app/`: Next.js routes and UI
- `packages/`: domain logic, protocol packages, and shared libraries
- `services/`: standalone supporting services
- `db/`: migrations
- `lib/`: auth, tracing, adapters, and runtime helpers
- `memory/`: semantic memory layer
- `docs/`: architecture, ops, and ledger documentation

## Key Docs

- [Current-state architecture](./docs/architecture/current-state-agent-platform.md)
- [Autonomous apply system diagrams](./docs/architecture/autonomous-apply-system.md)
- [Autonomous Apply Workday ops runbook](./docs/ops/autonomous-apply-workday-runbook.md)
- [Ledger architecture](./docs/ledger/architecture.md)
- [Docs index](./docs/README.md)
