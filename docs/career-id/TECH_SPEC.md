# Technical Specification
# Career ID Government ID Verification
# Owner: Backend + Frontend
# Status: Draft

## 1. Overview

This feature integrates Persona into Career ID to verify a user's identity using:
- government-issued ID
- selfie / liveness check

Persona supports pre-creating inquiries, retrieving inquiry status, and using webhooks for real-time outcome updates. The implementation for this feature should be backend-owned inquiry creation plus webhook-driven trust-state mutation.

## 2. Integration Decision

### Chosen pattern

Use Persona's inquiry-based integration with:
- backend-created verification record
- backend-created Persona inquiry
- frontend-launched Persona verification flow
- backend webhook as source of truth
- normalized internal result model

### Why

This aligns with Persona's inquiry + webhook model and keeps the backend responsible for verification truth, while still allowing the frontend launch method to evolve between hosted, embedded, and mobile patterns later.

## 3. System Components

### Frontend
- Career ID page
- Document-backed phase CTA
- verification modal / flow
- result state UI
- profile refresh logic

### Backend
- Persona client service
- verification session creation endpoint
- verification status endpoint
- Persona webhook endpoint
- normalization layer
- trust artifact persistence
- audit logging

### Data store
- verification attempt records
- evidence artifacts
- trust phase progress
- webhook idempotency records
- audit events

## 4. Core Flow

### Start flow
1. User opens the Career ID page.
2. User clicks `Verify your identity`.
3. Frontend calls `POST /api/v1/career-id/verifications/government-id/session`.
4. Backend:
   - validates user / session
   - creates or resumes an internal verification record
   - creates a Persona inquiry when needed
   - stores Persona reference metadata
   - returns launch information
5. Frontend launches Persona.

### Completion flow
1. Persona completes capture and processing.
2. Persona sends webhook event(s).
3. Backend verifies webhook authenticity.
4. Backend normalizes Persona result.
5. Backend updates the verification record.
6. Backend creates or updates the evidence artifact.
7. Backend recalculates trust phase progress.
8. Frontend reads updated backend state.

## 5. API Surface

### Create session

`POST /api/v1/career-id/verifications/government-id/session`

#### Request

```json
{
  "returnUrl": "/agent-build",
  "source": "career_id_page"
}
```

#### Response

```json
{
  "verificationId": "ver_123",
  "provider": "persona",
  "providerReferenceId": "inq_123",
  "launchMethod": "redirect_or_embedded",
  "launchUrl": "https://...",
  "expiresAt": "2026-04-17T12:00:00.000Z"
}
```

### Get verification

`GET /api/v1/career-id/verifications/:verificationId`

#### Response

```json
{
  "verificationId": "ver_123",
  "status": "in_progress",
  "checks": {
    "documentAuthenticity": "unknown",
    "liveness": "unknown",
    "faceMatch": "unknown"
  },
  "confidenceBand": "medium",
  "provider": "persona",
  "providerReferenceId": "inq_123",
  "completedAt": null
}
```

### Webhook endpoint

`POST /api/v1/career-id/verifications/webhooks/persona`

Consumes Persona webhook events and performs idempotent updates.

### Read profile

`GET /api/v1/career-id/profile`

Returns full Career ID trust ladder and evidence state.

### Retry evidence

`POST /api/v1/career-id/evidence/:evidenceId/retry`

Creates a new verification attempt when the previous state is retryable.

## 6. Internal Models

```ts
export type TrustLayer =
  | "self_reported"
  | "relationship_backed"
  | "document_backed"
  | "signature_backed"
  | "institution_verified";

export type VerificationStatus =
  | "locked"
  | "not_started"
  | "in_progress"
  | "verified"
  | "retry_needed"
  | "manual_review"
  | "failed";

export interface CareerIdEvidenceItem {
  id: string;
  userId: string;
  phase: TrustLayer;
  type:
    | "government_id"
    | "selfie_liveness"
    | "diploma"
    | "certification"
    | "transcript"
    | "endorsement"
    | "reference_letter"
    | "signed_letter"
    | "institution_check";
  provider?: "persona" | "internal";
  providerReferenceId?: string;
  status: VerificationStatus;
  confidenceBand?: "low" | "medium" | "high";
  createdAt: string;
  completedAt?: string;
  manualReviewRequired?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GovernmentIdVerificationResult {
  verificationId: string;
  status: "verified" | "retry_needed" | "manual_review" | "failed";
  checks: {
    documentAuthenticity: "pass" | "fail" | "unknown";
    liveness: "pass" | "fail" | "unknown";
    faceMatch: "pass" | "fail" | "unknown";
  };
  confidenceBand: "low" | "medium" | "high";
  provider: "persona";
  providerReferenceId: string;
  completedAt?: string;
}
```

## 7. Persistence

### Table: `career_id_verifications`

Fields:
- `id`
- `career_identity_id`
- `phase`
- `type`
- `provider`
- `provider_reference_hash`
- `provider_reference_encrypted`
- `status`
- `confidence_band`
- `checks_json`
- `latest_event_id`
- `latest_event_created_at`
- `attempt_number`
- `created_at`
- `updated_at`
- `completed_at`

### Table: `career_id_evidence`

Fields:
- `id`
- `career_identity_id`
- `phase`
- `label`
- `type`
- `status`
- `provider`
- `provider_reference_hash`
- `provider_reference_encrypted`
- `metadata_json`
- `created_at`
- `updated_at`
- `completed_at`

### Table: `career_id_audit_events`

Fields:
- `id`
- `career_identity_id`
- `verification_id`
- `event_type`
- `provider`
- `provider_event_id`
- `payload_hash`
- `created_at`

## 8. Status Mapping

Map Persona states / events into:
- `in_progress`
- `verified`
- `retry_needed`
- `manual_review`
- `failed`

Rules:
- approved or clearly successful inquiry outcome => `verified`
- ambiguous or review-required outcome => `manual_review`
- recoverable capture-quality issues => `retry_needed`
- hard failure => `failed`

Exact mapping should live in a dedicated normalization function.

## 9. Webhook Handling

Requirements:
- verify webhook authenticity
- process idempotently
- persist raw event metadata safely
- never log raw document image payloads
- reject duplicate or older already-applied terminal events

Pseudo-flow:
1. receive webhook
2. verify signature
3. parse provider event
4. check idempotency and ordering
5. retrieve inquiry details when needed
6. normalize to internal result
7. persist verification update
8. update or create evidence
9. recalculate phase counts
10. write audit event

## 10. Security & Privacy

- backend owns provider secret usage
- no client-side secret exposure
- encrypt provider reference IDs when configured
- store the minimum data necessary
- avoid long-term raw biometric media retention
- redact media payloads from logs
- rate limit session creation endpoint
- require authenticated user for session creation
- enforce ownership checks on verification read endpoints

## 11. Failure Handling

Support:
- provider timeout
- webhook retry from Persona
- duplicate webhook delivery
- out-of-order webhook delivery
- partial completion
- user abandonment
- expired inquiry session
- retry-needed flow restart

## 12. Frontend Refresh Strategy

Preferred behavior:
- optimistic UI only for started, never for verified
- refresh profile after return from Persona flow
- optional lightweight polling for short-lived in-progress state
- final truth always derived from backend profile / status endpoints

## 13. Observability

Emit structured events:
- `verification_session_created`
- `persona_flow_started`
- `persona_webhook_received`
- `verification_normalized`
- `trust_phase_updated`
- `evidence_created`
- `evidence_updated`
- `badge_created`

Track:
- conversion funnel by step
- webhook latency
- verification result distribution
- retry rate
- failure reason buckets

## 14. Open Questions

- exact Persona inquiry template configuration
- whether hosted flow or embedded flow is the first launch method
- exact retry thresholds
- exact manual review escalation path
