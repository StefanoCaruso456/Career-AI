# Acceptance Test Plan
# Career ID Government ID Verification
# Owner: QA / Engineering
# Status: Draft

## 1. Objective

Verify that the Career ID government ID verification flow works end to end using Persona and updates Career ID trust state correctly.

## 2. Scope

In scope:
- Career ID entry point
- Persona session / inquiry creation
- verification flow state handling
- webhook ingestion
- trust artifact creation
- Document-backed count update
- retry / manual review / failed handling

Out of scope:
- blockchain / wallet issuance
- institution verification
- non-government document-backed artifact types

## 3. Test Categories

### Unit tests
1. Persona status normalization maps provider outcomes into internal statuses correctly.
2. Trust-phase progress computation increments counts correctly.
3. Retry eligibility logic behaves correctly.
4. Badge creation logic creates `Government ID verified` only on verified status.
5. Idempotency guard prevents duplicate terminal state mutations.

### Integration tests
1. `POST /session` creates an internal verification record.
2. Persona provider client is called with expected parameters.
3. Webhook handler validates and ingests the event.
4. Webhook updates verification state.
5. Evidence record is created or updated.
6. Profile endpoint reflects the new trust state.
7. Duplicate webhook delivery does not create duplicate artifacts.

### Frontend tests
1. Locked state renders with no active CTA.
2. Unlocked state renders `Verify your identity`.
3. Clicking the CTA opens the verification flow.
4. In-progress state renders correctly.
5. Verified state renders artifact and updated count.
6. Retry-needed state renders recovery copy and retry CTA.
7. Manual-review state renders waiting state.
8. Failed state renders non-terminal safe copy.

### E2E tests

#### Happy path
1. User opens Career ID page.
2. User sees an unlocked Document-backed row.
3. User clicks `Verify your identity`.
4. Backend creates the verification session.
5. Provider flow is launched.
6. Simulated Persona webhook returns verified.
7. Page refreshes from backend state.
8. Document-backed count increments.
9. `Government ID verified` artifact appears.

#### Retry path
1. User starts verification.
2. Simulated webhook returns a retry-needed outcome.
3. Page shows retry guidance.
4. Retry CTA starts a new attempt.

#### Manual review path
1. User starts verification.
2. Simulated webhook returns a manual-review outcome.
3. Page shows review-pending state.
4. No verified badge is created prematurely.

#### Failed path
1. User starts verification.
2. Simulated webhook returns a failed outcome.
3. Page shows failure state.
4. Count does not increment.
5. Verified badge does not appear.

## 4. Acceptance Criteria

### AC1 — Entry point

Given Document-backed is unlocked, when the user views the Career ID page, then the `Verify your identity` CTA is shown.

### AC2 — Backend session creation

Given the user clicks the CTA, when the session endpoint succeeds, then an internal verification record and Persona reference are created.

### AC3 — Source of truth

Given the frontend launches the Persona flow, when the provider flow completes, then the Career ID page is not marked verified unless backend webhook processing confirms the result.

### AC4 — Verified outcome

Given a verified Persona result, when the webhook is processed, then:
- verification status becomes `verified`
- Document-backed completed count increments
- `Government ID verified` artifact is created
- profile endpoint returns updated state

### AC5 — Retry-needed outcome

Given a retryable provider outcome, when the webhook is processed, then:
- verification status becomes `retry_needed`
- completed count does not increment
- retry guidance is shown

### AC6 — Manual review outcome

Given a manual-review provider outcome, when the webhook is processed, then:
- verification status becomes `manual_review`
- completed count does not increment
- verified badge is not created

### AC7 — Failed outcome

Given a hard failure outcome, when the webhook is processed, then:
- verification status becomes `failed`
- completed count does not increment
- verified badge is not created

### AC8 — Idempotency

Given the same provider webhook is delivered more than once, when the webhook endpoint processes it, then only one terminal trust mutation occurs.

### AC9 — Security

Given session creation and webhook ingestion, then:
- no provider secret is exposed to the client
- no raw biometric media is written to logs
- authenticated ownership is enforced on read endpoints

## 5. Manual QA Checklist

- [ ] locked state looks correct
- [ ] unlocked state looks correct
- [ ] modal copy matches approved language
- [ ] mobile experience is usable
- [ ] return from provider flow is clear
- [ ] success state feels premium and understandable
- [ ] failure states are calm and actionable
- [ ] next best uploads update after success
- [ ] no duplicate badges appear after repeated events
