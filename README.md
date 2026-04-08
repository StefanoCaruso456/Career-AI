# taid_ai

Talent Agent ID is a ChatGPT-inspired frontend and documentation foundation for the Agent Identity Platform.

## Overview

The product creates a persistent, portable candidate identity that stores trusted evidence across employment, education, certifications, and endorsements. The current repository includes:

- a homepage frontend for the Talent Agent ID experience
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

- **Talent Agent ID**: the candidate-facing verified professional identity
- **Soul Record**: the internal structured record that stores evidence, statuses, and audit history
- **Agent QR**: the shareable recruiter-safe profile entry point

## Getting Started

```bash
npm install
npm run dev
```

The app runs locally at [http://localhost:3000](http://localhost:3000).

## Product Goal

Hiring data is fragmented, self-reported, and increasingly noisy. Talent Agent ID exists to create a reusable trust layer so candidates can prove credibility faster and recruiters can evaluate claims with clearer signals.

## Current Frontend

The current homepage is a minimal, modern, ChatGPT-inspired shell for the Talent Agent ID experience. It includes:

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
