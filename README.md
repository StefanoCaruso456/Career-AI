# Career AI

Career AI is a ChatGPT-inspired frontend and documentation foundation for the Agent Identity Platform.

## Overview

The product creates a persistent, portable candidate identity that stores trusted evidence across employment, education, certifications, and endorsements. The current repository includes:

- a homepage frontend for the Career AI experience
- product, planning, and implementation documents
- the foundation for future candidate, recruiter, and admin workflows

## Tech Stack

- Next.js App Router
- React
- TypeScript
- CSS Modules
- Zod
- Vitest
- Lucide icons

## Core Concepts

- **Career AI identity**: the candidate-facing verified professional identity
- **Soul Record**: the internal structured record that stores evidence, statuses, and audit history
- **Agent QR**: the shareable recruiter-safe profile entry point

## Getting Started

```bash
npm install
cp .env.example .env.local
# add your OPENAI_API_KEY, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET to .env.local
npm run dev
```

The app runs locally at [http://localhost:3000](http://localhost:3000).
The homepage assistant calls the official OpenAI Node SDK from the server-side `/api/chat` route and reads `OPENAI_API_KEY` and `OPENAI_MODEL` from the environment.

## Google Auth

This app now includes Google sign-in using Auth.js and NextAuth route handlers.

Required environment variables:

- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The auth flow also accepts Railway-style aliases if you already created them that way:

- `CLIENT_ID` as an alias for `GOOGLE_CLIENT_ID`
- `CLIENT_SECRET` as an alias for `GOOGLE_CLIENT_SECRET`

If Railway injects `RAILWAY_PUBLIC_DOMAIN`, the app can derive `NEXTAUTH_URL` automatically when it is missing.

Google Cloud OAuth client values for Railway production:

- Authorized JavaScript origin: `https://taidai-production.up.railway.app`
- Authorized redirect URI: `https://taidai-production.up.railway.app/api/auth/callback/google`

Local development values:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

After configuration:

- `/sign-in` starts the Google flow
- `/account` is a protected page that requires a valid session

## Deployment

The repository now includes a GitHub Actions pipeline and Railway config for production deploys.

### GitHub Actions

Pushes to `main` will:

- install dependencies
- run `npm run test`
- run `npm run build`
- deploy to Railway if CI passes

The workflow expects these GitHub repository secrets:

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`

Optional GitHub repository variables:

- `RAILWAY_ENVIRONMENT` defaults to `production`
- `RAILWAY_SERVICE` if your Railway project contains more than one service

### Railway

The Railway deployment is configured in `railway.toml` with:

- `npm run build` as the build command
- `npm run start` as the start command
- `/api/v1/health` as the healthcheck path

If you connect a public domain in Railway, this Next.js app is ready to serve it without additional code changes.

## Product Goal

Hiring data is fragmented, self-reported, and increasingly noisy. Career AI exists to create a reusable trust layer so candidates can prove credibility faster and recruiters can evaluate claims with clearer signals.

## Current Frontend

The current homepage is a minimal, modern, ChatGPT-inspired shell for the Career AI experience. It includes:

- a left navigation rail with project and chat controls
- a centered conversational composer layout
- a neumorphic dark theme aligned to the product brand
- responsive behavior for desktop and mobile

## Current API Foundation

Increment 1 from the development spec is now underway. The repository includes a first backend slice for:

- shared contracts under `packages/contracts`
- identity domain logic under `packages/identity-domain`
- audit and access helpers under `packages/audit-security`
- health and identity APIs under `/api/v1`

Current endpoints:

- `GET /api/v1/health`
- `POST /api/v1/talent-identities`
- `GET /api/v1/talent-identities/{id}`
- `PATCH /api/v1/talent-identities/{id}/privacy-settings`

## Product Principles

- verified and self-reported claims must be visually distinct
- provenance must be auditable
- candidate sharing must remain permissioned
- trust levels must be explicit and explainable
- manual workflows must be useful before agentic automation exists

## Repository Layout

```text
.
├── README.md
├── app
├── components
├── packages
└── docs
    ├── README.md
    ├── architecture
    │   └── talent-agent-id-development-spec.md
    ├── planning
    │   └── agent-delivery-roadmap.md
    └── product
        └── agent-identity-platform-prd.md
```

## Key Docs

- [Product Requirements Document](./docs/product/agent-identity-platform-prd.md)
- [Delivery Roadmap and Parallel Agent Plan](./docs/planning/agent-delivery-roadmap.md)
- [Development Spec for Isolated Dev Agents](./docs/architecture/talent-agent-id-development-spec.md)
- [Documentation Index](./docs/README.md)

## Current Status

This repository now contains the initial frontend surface plus the documentation needed to move into architecture, contracts, and domain implementation.
