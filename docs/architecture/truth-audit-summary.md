# Truth Audit Summary

This audit reconciled repository docs against the code as of the current branch state.

## Major Corrections Made

- Rewrote the top-level README to describe the repo as a real Next.js application plus package-style modules, standalone workspaces, and optional services, not a planning-era platform outline.
- Rewrote the architecture docs around the actual runtime boundaries: `/api/chat`, the LangGraph job-seeker agent, internal agent endpoints, external A2A endpoints, and the recruiter product-search handoff.
- Expanded the top-level docs to cover the live access-request, share-profile, recruiter marketplace, reusable application-profile, and mixed-authentication surfaces that were present in code but underrepresented in the summaries.
- Corrected jobs-search docs to reflect the real dual-path implementation: legacy retrieval plus v2 retrieval behind `JOB_SEARCH_RETRIEVAL_V2_ENABLED`.
- Corrected chat docs to reflect current storage truth: metadata can be Postgres-backed, attachment bytes still live under `.artifacts/chat/files`, and memory extraction runs inline.
- Corrected autonomous-apply docs from Workday-only language to the current code path, which supports Workday and Greenhouse adapters and multiple worker modes.
- Corrected A2A docs to match the real protocol persistence tables, auth model, and recruiter special-case dispatch.
- Replaced stale service and infrastructure README content that described unimplemented services or placeholder shared infrastructure as if they were active deployables.
- Deleted stale planning, PRD, memory-taxonomy, pre-merge ledger, and draft-spec docs that described systems or repo boundaries not present in the current codebase.

## Partial, Scaffolded, Or Nonfunctional Areas

- Verification, credential, artifact, and share-profile subsystems still contain in-memory stores that reset on process restart.
- Chat checkpoints, activity history, and restore are only implemented in DB-backed chat mode.
- Jobs feed refresh is request-triggered. There is no scheduler in this repo.
- Recruiter share-profile QR generation returns QR payload data, not a rendered image asset.
- `POST /api/v1/jobs/apply-click` only queues supported autonomous-apply targets or returns `open_external`; it does not automate every ATS family.
- Several UI routes remain mostly placeholder shells: `/employer/roles`, `/employer/agent-sorcerer`, and `/wallet`.
- The repo has no general multi-agent workflow engine. Internal and external agents are bounded request/response endpoints.

## Remaining Unverifiable Areas

- Third-party integrations that require live credentials were not verified end to end in this audit: Persona, OpenAI provider responses, Braintrust observed spans, Resend, Twilio, S3-backed blob storage, and external job-feed sources.
- The optional `services/api-gateway` and `services/pdf-extractor` workspaces were verified structurally and through wiring points in the Next app, but not executed end to end during this audit.
- Production deployment behavior beyond the checked-in Railway config files was not directly observed.
