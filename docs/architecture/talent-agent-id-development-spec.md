# Talent Agent ID Development Spec

Status: Draft
Version: v1
Date: April 8, 2026
Audience: Development agents, architects, and engineering leads

## 1. Purpose

This document is the implementation-grade specification for development agents building the Agent Identity Platform. It sits below the PRD and roadmap and defines the shared contracts, service boundaries, APIs, data models, events, workflows, engineering rules, and agent task cards required for safe parallel implementation.

This is the main execution packet for engineering agents after reading:

- [Agent Identity Platform PRD](../product/agent-identity-platform-prd.md)
- [Agent Delivery Roadmap](../planning/agent-delivery-roadmap.md)

## 2. Product Context

### Working Product Name

Talent Agent ID

### Core Concepts

- **Talent Agent ID**: the candidate-facing persistent verified identity
- **Soul Record**: the internal canonical record that stores verified identity artifacts and claims
- **Agent QR**: the recruiter-shareable QR or URL-based verification view

### Primary Users

- talent or candidate
- recruiter
- hiring manager
- verification operations admin
- external verifier such as employer, institution, or former colleague

## 3. Build Objective

Build the MVP foundation for a portable professional identity and verification platform that allows a candidate to:

- create a Talent Agent ID
- upload employment, education, and certification evidence
- receive verification statuses on their claims
- request endorsements
- share a recruiter-safe trust profile through a URL or QR code

The first release does not require full external automation. It must be useful with document-backed and human-reviewed verification.

## 4. System Architecture Overview

The platform should be built as modular services with explicit contracts.

### Core Service Domains

1. Identity Service
2. Artifact Service
3. Verification Service
4. Credential Domain Service
5. Recruiter Read Model Service
6. Admin Operations Service
7. Audit and Security Service
8. Orchestration Service for Phase 3 and beyond

### High-Level Architecture Rules

- separate write models from recruiter-facing read models
- use asynchronous jobs for parsing and verification processing
- preserve original evidence separately from normalized extracted fields
- route all verification state changes through one verification engine
- route all sensitive actions through audit logging
- candidate-facing permissions control recruiter-visible outputs

## 5. Canonical Shared Contracts

These contracts are authoritative. No implementation agent may redefine them without architecture approval.

### 5.1 Canonical Glossary

- **Claim**: a user-asserted fact about employment, education, certification, or endorsement
- **Evidence Artifact**: an uploaded or externally provided file or proof source supporting a claim
- **Verification Record**: a record tying a claim to its current status, method, and provenance
- **Source Verification**: confirmation received from an originating institution, employer, or authorized human
- **Reviewed**: human or rule-based validation of evidence without direct source confirmation
- **Recruiter Read Model**: safe projection of trust information optimized for recruiter UI
- **Soul Record**: internal canonical aggregation of all claims, evidence, statuses, and audit history

### 5.2 Verification Status Enum

Allowed statuses:

- `NOT_SUBMITTED`
- `SUBMITTED`
- `PARSING`
- `PARSED`
- `PENDING_REVIEW`
- `PARTIALLY_VERIFIED`
- `REVIEWED`
- `SOURCE_VERIFIED`
- `MULTI_SOURCE_VERIFIED`
- `REJECTED`
- `EXPIRED`
- `NEEDS_RESUBMISSION`

### 5.3 Verification Confidence Tiers

Allowed confidence tiers:

- `SELF_REPORTED`
- `EVIDENCE_SUBMITTED`
- `REVIEWED`
- `SOURCE_CONFIRMED`
- `MULTI_SOURCE_CONFIRMED`

### 5.4 Verification Methods Enum

Allowed methods:

- `USER_UPLOAD`
- `INTERNAL_REVIEW`
- `EMPLOYER_AGENT`
- `INSTITUTION_AGENT`
- `AUTHORIZED_HUMAN`
- `PUBLIC_REGISTRY`
- `ENDORSEMENT_SUBMISSION`
- `SYSTEM_RULE_MATCH`

### 5.5 Artifact Metadata Schema

Required fields:

- artifact_id
- owner_talent_id
- artifact_type
- mime_type
- original_filename
- storage_uri
- sha256_checksum
- uploaded_by_actor_type
- uploaded_by_actor_id
- source_type
- source_label
- uploaded_at
- parsing_status
- retention_policy
- redaction_status

### 5.6 Audit Event Schema

All audited events must include:

- event_id
- event_type
- actor_type
- actor_id
- target_type
- target_id
- correlation_id
- occurred_at
- metadata_json

### 5.7 Error Model

Every service must return consistent errors:

- error_code
- message
- details
- correlation_id

Suggested top-level error codes:

- `INVALID_REQUEST`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `VALIDATION_FAILED`
- `RATE_LIMITED`
- `INTERNAL_ERROR`
- `DEPENDENCY_FAILURE`

## 6. Domain Model Specification

### 6.1 Core Identity Objects

#### TalentIdentity

Fields:

- id
- talent_agent_id
- email
- phone_optional
- first_name
- last_name
- display_name
- country_code
- created_at
- updated_at
- status
- privacy_settings_id

#### SoulRecord

Fields:

- id
- talent_identity_id
- trust_summary_id
- default_share_profile_id
- created_at
- updated_at
- version

#### PrivacySettings

Fields:

- id
- talent_identity_id
- show_employment_records
- show_education_records
- show_certification_records
- show_endorsements
- show_status_labels
- show_artifact_previews
- allow_public_share_link
- allow_qr_share
- created_at
- updated_at

### 6.2 Claim and Verification Objects

#### Claim

Fields:

- id
- soul_record_id
- claim_type
- title
- summary
- self_reported_payload_json
- current_verification_record_id
- created_at
- updated_at

#### VerificationRecord

Fields:

- id
- claim_id
- status
- confidence_tier
- primary_method
- source_label
- source_reference_optional
- reviewer_actor_id_optional
- reviewed_at_optional
- expires_at_optional
- notes_optional
- created_at
- updated_at

#### ProvenanceRecord

Fields:

- id
- verification_record_id
- artifact_id_optional
- source_actor_type
- source_actor_id_optional
- source_method
- source_details_json
- created_at

### 6.3 Credential-Specific Models

#### EmploymentRecord

Fields:

- id
- claim_id
- employer_name
- employer_domain_optional
- role_title
- employment_type_optional
- start_date
- end_date_optional
- currently_employed
- location_optional
- signatory_name_optional
- signatory_title_optional
- company_letterhead_detected_optional
- document_date_optional
- created_at
- updated_at

#### EducationRecord

Fields:

- id
- claim_id
- institution_name
- degree_or_program
- field_of_study_optional
- start_date_optional
- completion_date_optional
- credential_level_optional
- created_at
- updated_at

#### CertificationRecord

Fields:

- id
- claim_id
- issuer_name
- certification_name
- credential_id_optional
- issue_date_optional
- expiration_date_optional
- status_label_optional
- created_at
- updated_at

#### EndorsementRecord

Fields:

- id
- claim_id
- endorser_name
- endorser_email_optional
- endorser_title_optional
- endorser_company_optional
- relationship_type
- relationship_years_optional
- overlap_context_optional
- endorsement_text
- endorsement_verification_level
- created_at
- updated_at

### 6.4 Read Models

#### RecruiterTrustProfile

Fields:

- id
- talent_identity_id
- public_share_token
- trust_summary_json
- visible_employment_records_json
- visible_education_records_json
- visible_certification_records_json
- visible_endorsements_json
- generated_at
- expires_at_optional

#### TrustSummary

Fields:

- id
- soul_record_id
- total_claims
- total_verified_claims
- total_reviewed_claims
- total_rejected_claims
- employment_verification_count
- education_verification_count
- certification_verification_count
- endorsement_count
- last_verified_at_optional
- generated_at

## 7. Service Boundaries

### 7.1 Identity Service

Owns:

- TalentIdentity
- SoulRecord lifecycle
- privacy settings
- Talent Agent ID generation

Must expose:

- create talent identity
- fetch identity
- update privacy settings
- fetch Soul Record metadata

Must not own:

- document storage
- verification status transitions
- recruiter read projections

### 7.2 Artifact Service

Owns:

- artifact upload
- artifact metadata
- artifact retrieval authorization
- parser job enqueueing
- artifact linkage to claims

Must expose:

- upload artifact
- attach artifact to claim
- fetch artifact metadata
- request secure artifact download

Must not own:

- verification decisions
- recruiter share permissions

### 7.3 Verification Service

Owns:

- verification statuses
- confidence tiers
- review actions
- provenance records
- validation rules for status transitions

Must expose:

- create verification record
- transition status
- attach provenance
- approve, reject, flag

Must not own:

- candidate profile
- UI logic
- external connector specifics

### 7.4 Credential Domain Service

Owns:

- employment claims and records
- education claims and records
- certification claims and records
- endorsement claims and records

Must expose:

- create record from self-report or parsed artifact
- update record
- fetch record details
- request endorsement flow

Must not own:

- generic auth
- generic audit storage

### 7.5 Recruiter Read Model Service

Owns:

- recruiter-safe projections
- share-token-based view generation
- trust summary rendering data

Must expose:

- generate recruiter trust profile
- fetch trust profile by share token
- refresh trust summary

Must not own:

- raw record mutation
- evidence editing

### 7.6 Admin Operations Service

Owns:

- review queues
- decision console
- fraud flagging
- escalation states

Must expose:

- list pending review records
- submit reviewer decision
- flag suspicious artifacts or claims
- fetch provenance and audit trail

### 7.7 Audit and Security Service

Owns:

- auth tokens and session validation
- RBAC roles and policies
- audit event emission and retrieval
- consent recording

Roles:

- talent_user
- recruiter_user
- hiring_manager_user
- reviewer_admin
- system_service

## 8. API Interface Specification

All endpoints are prefixed with `/api/v1`.

### 8.1 Identity APIs

#### POST `/talent-identities`

Create a talent identity.

Request:

```json
{
  "email": "user@example.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "countryCode": "US"
}
```

Response:

```json
{
  "id": "tal_123",
  "talentAgentId": "TAID-000123",
  "soulRecordId": "soul_123",
  "createdAt": "2026-04-08T12:00:00Z"
}
```

#### GET `/talent-identities/{id}`

Fetch talent identity.

#### PATCH `/talent-identities/{id}/privacy-settings`

Update recruiter-visible settings.

### 8.2 Artifact APIs

#### POST `/artifacts/upload`

Multipart upload endpoint.

Response:

```json
{
  "artifactId": "art_123",
  "mimeType": "application/pdf",
  "parsingStatus": "QUEUED"
}
```

#### POST `/claims/{claimId}/artifacts`

Attach artifact to claim.

#### GET `/artifacts/{artifactId}`

Fetch artifact metadata.

### 8.3 Claim and Credential APIs

#### POST `/claims/employment`

Create employment claim.

Request:

```json
{
  "soulRecordId": "soul_123",
  "employerName": "Acme Inc",
  "roleTitle": "Product Manager",
  "startDate": "2022-01-15",
  "endDate": "2024-02-28",
  "currentlyEmployed": false
}
```

Response:

```json
{
  "claimId": "claim_emp_123",
  "employmentRecordId": "emp_123",
  "verificationStatus": "SUBMITTED"
}
```

#### POST `/claims/education`

Create education claim.

#### POST `/claims/certifications`

Create certification claim.

#### POST `/claims/endorsements`

Create endorsement request or manual endorsement record.

#### GET `/claims/{claimId}`

Fetch claim and current verification.

### 8.4 Verification APIs

#### POST `/verification-records`

Create verification record.

#### POST `/verification-records/{id}/transition`

Transition status.

Request:

```json
{
  "targetStatus": "REVIEWED",
  "reason": "Official company letterhead confirmed",
  "reviewerActorId": "admin_77"
}
```

#### POST `/verification-records/{id}/provenance`

Attach provenance source.

#### POST `/verification-records/{id}/reject`

Reject claim.

### 8.5 Recruiter Share APIs

#### POST `/share-profiles`

Generate recruiter-safe trust profile token.

#### GET `/share-profiles/{token}`

Fetch recruiter trust profile.

#### POST `/share-profiles/{id}/qr`

Generate QR payload.

### 8.6 Admin APIs

#### GET `/admin/review-queue`

List pending items.

#### POST `/admin/review-decisions`

Submit approval, rejection, or needs-resubmission.

#### GET `/admin/claims/{claimId}/audit`

Fetch audit and provenance timeline.

## 9. Event Model Specification

Events must be emitted for all async and cross-service flows.

Required events:

- `talent.identity.created`
- `soul_record.created`
- `artifact.uploaded`
- `artifact.parsing.requested`
- `artifact.parsing.completed`
- `claim.created`
- `verification.record.created`
- `verification.status.changed`
- `verification.review.approved`
- `verification.review.rejected`
- `verification.review.needs_resubmission`
- `endorsement.requested`
- `endorsement.submitted`
- `recruiter.share_profile.generated`
- `candidate.privacy_settings.updated`
- `audit.event.logged`

Event payload baseline:

- event_name
- event_id
- occurred_at
- correlation_id
- actor_type
- actor_id
- subject_type
- subject_id
- payload

## 10. Workflow Specifications

### 10.1 Candidate Onboarding Workflow

1. Candidate creates account.
2. Identity Service creates `TalentIdentity`.
3. System generates Talent Agent ID.
4. System creates `SoulRecord`.
5. Audit event emitted.
6. Candidate lands on empty dashboard.

Acceptance criteria:

- Talent Agent ID is unique
- Soul Record exists immediately after onboarding
- audit events recorded

### 10.2 Employment Upload Workflow

1. Candidate uploads employment evidence artifact.
2. Artifact Service stores file and metadata.
3. Parser job is queued.
4. Candidate may manually create employment claim immediately or from parsed output.
5. Verification record initialized as `SUBMITTED`.
6. Parsed fields populate draft employment record if available.
7. Admin review queue receives item if configured.

Acceptance criteria:

- original artifact preserved
- parsed fields do not overwrite user-entered values without traceability
- claim shows current status in candidate UI

### 10.3 Admin Review Workflow

1. Reviewer opens pending claim.
2. Reviewer sees claim, artifacts, extracted fields, and provenance.
3. Reviewer chooses approve, reject, or needs resubmission.
4. Verification Service validates transition.
5. Audit event logged.
6. Recruiter read model refresh queued.

Acceptance criteria:

- only `reviewer_admin` may take review actions
- every decision includes reason code or note
- read model eventually reflects status change

### 10.4 Endorsement Workflow

1. Candidate requests endorsement.
2. Endorsement request token or link generated.
3. Endorser submits relationship details and endorsement text.
4. Endorsement record created.
5. Verification status initialized as `SUBMITTED` or `REVIEWED` depending on workflow.
6. Audit and provenance recorded.

Acceptance criteria:

- endorsement and endorser identity are stored separately from candidate-authored text
- endorsement UI clearly labels trust level

### 10.5 Recruiter Share Workflow

1. Candidate enables share permissions.
2. Share profile token created.
3. Recruiter opens share link or QR.
4. Recruiter Read Model Service returns safe projection only.
5. Recruiter sees trust summary and visible record categories.

Acceptance criteria:

- hidden categories do not appear in payload or UI
- raw artifacts are not shown unless explicitly permitted
- status labels are readable and consistent

## 11. Security and Compliance Rules

Minimum security requirements:

- encrypt artifacts at rest
- signed URL or equivalent for artifact retrieval
- RBAC on all admin endpoints
- audit all read access to sensitive admin views
- redact or suppress sensitive raw artifacts in recruiter views by default
- consent required for future external verification workflows

Privacy defaults:

- recruiter share is opt-in
- raw documents are private by default
- endorsement email addresses are not public by default

## 12. Read Model Rules

Recruiter views must be generated from a projection layer, not directly from write models.

Recruiter summary rules must show:

- name or display name
- trust summary counts
- visible verified employment history
- visible education and certifications
- endorsements with trust level
- last verification update

Recruiter summary rules must not show by default:

- private contact details
- full raw uploaded documents
- internal reviewer notes
- internal fraud flags
- hidden record categories

## 13. Testing Requirements

Required test layers:

- unit tests for each service domain
- contract tests for APIs
- state transition tests for the verification engine
- integration tests for the upload-to-claim workflow
- authorization tests for recruiter, admin, and talent roles
- read model consistency tests

Minimum tests by domain:

### Identity Service

- unique ID creation
- Soul Record creation
- privacy updates

### Artifact Service

- upload success
- checksum stored
- invalid file rejected
- secure retrieval auth enforced

### Verification Service

- valid transitions allowed
- invalid transitions denied
- provenance creation required for review actions where configured

### Credential Domain Service

- employment claim create
- education claim create
- certification claim create
- endorsement submission flow

### Recruiter Read Model

- hidden fields excluded
- summary counts accurate
- only visible records included

### Admin Operations

- queue filters work
- decision actions audited
- unauthorized users blocked

## 14. Coding Standards for Dev Agents

- no business rules only in frontend
- no direct database access across service boundaries unless architecture explicitly allows a modular monolith pattern
- all endpoints must emit correlation IDs
- all state transitions must flow through the verification service
- all shared enums must be imported from the canonical contracts package
- every service must include metrics, a health check, and structured logging
- no silent failure on async jobs

## 15. Folder and Ownership Guidelines

Suggested repo structure:

```text
/apps
  /api
  /web
/packages
  /contracts
  /identity-domain
  /artifact-domain
  /verification-domain
  /credential-domain
  /recruiter-read-model
  /admin-ops
  /audit-security
/docs
  /product
  /architecture
  /agents
```

Package ownership:

- `/packages/contracts` owned by Architecture and Data Model agents
- `/packages/identity-domain` owned by the Identity Service agent
- `/packages/artifact-domain` owned by the Artifact agent
- `/packages/verification-domain` owned by the Verification agent
- `/packages/credential-domain` owned by the Credential Domain agent
- `/packages/recruiter-read-model` owned by the Recruiter Experience and read model agents
- `/packages/admin-ops` owned by the Admin Operations agent
- `/packages/audit-security` owned by the Security agent

## 16. Dev Agent Task Cards

### Agent A: Architecture and Contracts Agent

Scope:

- create canonical contracts and system design docs

Deliverables:

- bounded context map
- contracts package
- service interaction diagrams
- API conventions
- event conventions

Exit criteria:

- no missing core shared contracts
- all downstream agents can import canonical schemas

### Agent B: Identity Service Agent

Scope:

- implement `TalentIdentity`, Talent Agent ID generation, Soul Record lifecycle, and privacy settings

Deliverables:

- identity endpoints
- Soul Record creation flow
- persistence models
- tests

Exit criteria:

- onboarding flow fully works

### Agent C: Artifact Service Agent

Scope:

- implement file upload, metadata persistence, parser queue integration, and artifact-to-claim attachment

Deliverables:

- upload endpoints
- storage adapter
- artifact metadata model
- parser event emission
- tests

Exit criteria:

- candidate can upload an artifact and attach it safely to a claim

### Agent D: Verification Engine Agent

Scope:

- implement the status machine, confidence tiers, provenance linkage, and decision rules

Deliverables:

- verification library
- status transition API
- provenance model and endpoint
- tests for valid and invalid transitions

Exit criteria:

- all credential domains can use one shared verification engine

### Agent E: Credential Domain Agent

Scope:

- implement employment, education, certification, and endorsement records on top of `Claim` and `Verification` abstractions

Deliverables:

- claim creation APIs
- domain-specific schemas
- validation logic
- tests

Exit criteria:

- all four credential domains can be created and fetched

### Agent F: Recruiter Read Model Agent

Scope:

- implement recruiter-safe trust profile projections and share-token retrieval

Deliverables:

- share profile token generation
- recruiter read projection builder
- recruiter summary endpoints
- tests

Exit criteria:

- recruiter share link returns the correct safe projection

### Agent G: Admin Operations Agent

Scope:

- implement the review queue, review decision endpoints, and provenance timeline views

Deliverables:

- queue APIs
- review actions
- flagging actions
- tests

Exit criteria:

- reviewer can process pending verification items end to end

### Agent H: Security and Audit Agent

Scope:

- implement RBAC, audit event emission, and secure access policies

Deliverables:

- auth middleware
- role policy map
- audit event emitter
- tests

Exit criteria:

- role restrictions enforced and audited

### Agent I: Web UI Agent

Scope:

- implement the candidate dashboard, upload flows, verification status views, recruiter share page, and admin review UI shell

Deliverables:

- candidate dashboard
- artifact upload flow
- claim status pages
- recruiter trust page
- admin review views

Exit criteria:

- major flows are usable end to end against service APIs

### Agent J: QA and Integration Agent

Scope:

- implement end-to-end validation across all domains

Deliverables:

- integration suite
- workflow matrix
- regression checks
- release report

Exit criteria:

- MVP flows validated across roles and services

## 17. Implementation Sequence

### Increment 1: Contracts and Identity Foundation

- Agent A
- Agent B
- Agent H

### Increment 2: Artifact Pipeline and Employment Claim Baseline

- Agent C
- Agent D
- Agent E

### Increment 3: Recruiter Read Model and Admin Review

- Agent F
- Agent G
- Agent I

### Increment 4: Education, Certification, and Endorsements Completion

- Agent E
- Agent I
- Agent J

### Increment 5: Hardening and Release Readiness

- Agent H
- Agent J
- all agents for bug fixes

## 18. Definition of Done for MVP

The MVP is done when:

- a talent user can create a Talent Agent ID
- a Soul Record is created automatically
- a talent user can upload evidence artifacts
- a talent user can create employment, education, and certification claims
- a reviewer can review and update statuses
- a recruiter can access a safe share profile
- audit logging exists for all major actions
- role restrictions are enforced
- automated tests cover the core workflows

## 19. Future Phase Reserved Scope

These are explicitly deferred unless approved:

- agent-to-agent employer verification
- agent-to-institution verification
- external human verification orchestration
- trust scoring as ranking logic
- ATS integrations
- registry integrations
- certification renewal automation

## 20. Instruction to Build Agents

Before implementation:

1. read this document fully
2. import only canonical contracts from the shared contracts package
3. do not redefine shared schemas locally
4. implement only within the assigned bounded domain
5. include tests, integration notes, and handoff notes in every submission
6. escalate shared contract changes before coding around them

This document is the implementation source of truth for MVP development agents.
