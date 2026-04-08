# taid_ai

Agent Identity Platform documentation and planning repository.

## Overview

The Agent Identity Platform is a trust and verification layer for hiring. It creates a persistent, portable candidate identity called an **Agent ID** that stores verified evidence across employment, education, certifications, and endorsements.

The platform is designed to help:

- candidates prove credibility without repeating the same verification work
- recruiters evaluate claims with clearer trust signals
- hiring teams reduce manual screening and fraud risk

## Core Concepts

- **Agent ID**: the candidate-facing verified professional identity
- **Soul Record**: the internal structured record that stores evidence, statuses, and audit history
- **Agent QR**: the shareable recruiter-safe profile entry point

## Problem

Hiring data is fragmented, self-reported, and increasingly noisy. Resumes, profiles, and application materials are easy to exaggerate, while verification is still slow, manual, and inconsistent across employers, schools, and credential issuers.

This platform exists to create a reusable trust layer for candidate identity.

## MVP Scope

The initial product focuses on the trust foundation:

- candidate onboarding and Agent ID creation
- Soul Record creation and storage
- secure document upload and evidence storage
- structured verification records for employment, education, and certifications
- verification status tracking
- recruiter trust view
- admin review workflow
- audit logging
- Agent QR sharing

## Product Principles

- verified and self-reported claims must be clearly distinct
- provenance must be auditable
- candidate sharing must be permissioned
- trust levels must be explicit and explainable
- manual workflows must be useful before agentic automation exists

## Repository Layout

```text
.
├── README.md
└── docs
    ├── README.md
    ├── planning
    │   └── agent-delivery-roadmap.md
    └── product
        └── agent-identity-platform-prd.md
```

## Key Docs

- [Product Requirements Document](./docs/product/agent-identity-platform-prd.md)
- [Delivery Roadmap and Parallel Agent Plan](./docs/planning/agent-delivery-roadmap.md)
- [Documentation Index](./docs/README.md)

## Current Status

This repository currently contains product and delivery documentation only. Application code, architecture specs, and implementation artifacts have not been added yet.

## Next Recommended Docs

- system architecture overview
- Soul Record schema and domain model
- API and event contract specification
- verification operations playbook
- recruiter and candidate experience specs
