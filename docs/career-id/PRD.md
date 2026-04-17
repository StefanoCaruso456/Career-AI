# Product Requirements Document
# Career ID Government ID Verification
# Owner: Career ID
# Status: Draft
# Priority: High

## 1. Summary

Career ID needs a high-trust identity verification flow that allows a user to verify they are the same person shown on their government-issued ID. The user will complete a guided verification flow from the Career ID page by submitting a driver's license and a live selfie / liveness check.

The result will create a new trust artifact under the `Document-backed` phase and increase the user's Career ID credibility.

## 2. Problem

Today, Career ID shows trust phases, but the `Document-backed` phase does not yet have a production-ready workflow for government identity verification.

Without this:
- users cannot strengthen trust with high-quality identity proof
- recruiters cannot distinguish between self-reported identity and document-backed identity
- the Career ID ladder feels incomplete
- the platform lacks a repeatable path for stronger verification artifacts

## 3. Goal

Enable a user to verify their identity from the Career ID page through a secure, guided flow that:
- collects a government-issued ID
- collects a live selfie / liveness check
- receives a verified result from Persona
- updates the Career ID trust ladder
- creates a `Government ID verified` artifact

## 4. Non-Goals

This phase does not include:
- blockchain wallet issuance
- NFT minting
- passport-specific branching logic
- full manual review operations tooling
- institution verification
- reusable generic document upload flows for all artifact types

## 5. User Story

As a job seeker, I want to verify my identity with a government ID and selfie so that my Career ID becomes more credible and recruiters trust that I am a real person.

As a recruiter, I want to see which parts of a candidate's profile are document-backed so I can trust that their identity has stronger proof than self-reported claims.

## 6. Personas

### Primary
- Job seeker building a credible Career ID

### Secondary
- Recruiter reviewing candidate trust signals
- Operations / admin reviewer handling ambiguous cases

## 7. Success Metrics

### Product metrics
- verification start rate
- verification completion rate
- verified pass rate
- retry-needed rate
- manual-review rate
- abandonment rate by step
- Document-backed phase unlock rate
- lift in completed Career ID trust artifacts

### UX metrics
- modal completion time
- error rate by capture step
- retry rate per attempt
- mobile vs desktop completion rate

### Trust metrics
- count of users with `Government ID verified`
- percentage of Career IDs with at least 1 document-backed artifact

## 8. User Experience Overview

From the Career ID page:
1. User sees the `Document-backed` phase.
2. If unlocked, user sees `Verify your identity`.
3. User opens a guided flow:
   - why verify
   - consent
   - capture front of ID
   - capture back of ID
   - selfie / liveness
   - processing
   - result
4. After verified webhook-confirmed success:
   - Document-backed count increments
   - `Government ID verified` badge / artifact appears
   - next best uploads update dynamically

## 9. Functional Requirements

### FR1 — Entry point

The `Document-backed` row on the Career ID page must expose a primary CTA when the phase is unlocked:
- CTA label: `Verify your identity`

### FR2 — Guided verification flow

The verification flow must include:
- intro screen
- consent / privacy screen
- front of ID capture
- back of ID capture
- selfie / liveness capture
- processing state
- success / failure / retry / manual review state

### FR3 — Provider integration

The flow must use Persona as the verification provider.

### FR4 — Trust state update

Career ID trust state must update only after backend-confirmed Persona result processing.

### FR5 — Artifact creation

On verified success, create:
- badge label: `Government ID verified`
- trust phase: `document_backed`

### FR6 — Status support

The system must support these internal statuses:
- locked
- not_started
- in_progress
- verified
- retry_needed
- manual_review
- failed

### FR7 — Retry support

If the verification cannot be completed because of capture quality or non-terminal issues, the system must present retry guidance and allow a retry.

### FR8 — Dynamic recommendations

After successful verification, the `Next best uploads` section should update to suggest the next strongest document-backed proofs.

## 10. Unlock Logic

Initial rule for MVP:
- `Document-backed` remains locked until prior required trust-layer conditions are met.
- once unlocked, user can start government ID verification.

The exact unlock rule should be configurable server-side.

## 11. Risks

- user drop-off during document capture
- desktop users may struggle with ID capture
- false failures from poor lighting or blurry images
- incorrect frontend assumptions about success before webhook confirmation
- privacy / security concerns if raw media is retained too long

## 12. Dependencies

- Persona API and inquiry flow
- webhook ingestion
- Career ID profile API
- internal trust / evidence persistence
- audit logging

## 13. Launch Scope

### MVP
- one entry point on Career ID page
- Persona-based driver's license + selfie / liveness flow
- verified / retry / manual_review / failed states
- Document-backed count update
- Government ID verified artifact rendering

### Post-MVP
- manual review operations dashboard
- additional document types
- deeper recruiter-facing proof inspection
- reusable verification orchestration layer across trust phases

## 14. Acceptance Criteria

1. User can start identity verification from the Career ID page.
2. Backend creates a Persona-backed verification session / inquiry.
3. Persona webhook updates internal verification state.
4. On verified success, Document-backed count increments.
5. `Government ID verified` artifact appears.
6. Retry / manual review / failed states show the correct UI and recovery path.
7. No client-only state mutation can mark a verification as successful.
