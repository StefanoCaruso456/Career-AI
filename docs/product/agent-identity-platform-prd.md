# Agent Identity Platform PRD

Status: Draft
Version: v1
Date: April 7, 2026
Owner: Product Management

## 1. Executive Summary

The Agent Identity Platform is a candidate trust and verification platform for recruiters and hiring managers. It creates a persistent, portable, and verified professional identity for each candidate called an **Agent ID**.

The platform stores structured verification evidence across employment, education, certifications, endorsements, and identity-linked records. Candidates can share this verified identity with recruiters and hiring managers through a controlled profile or QR code while retaining control over visibility and permissions.

The platform combines:

- document-based verification
- agent-to-agent verification
- agent-to-human verification
- candidate-controlled sharing

The product goal is to reduce fraud, improve candidate trust, and accelerate hiring decisions.

## 2. Glossary

- **Agent Identity Platform**: the overall product and trust infrastructure
- **Agent ID**: the portable candidate identity record presented to users
- **Soul Record**: the internal structured data layer behind the candidate identity
- **Agent QR**: the shareable QR-based access point to a permissioned recruiter view

## 3. Problem Statement

Hiring teams increasingly struggle to trust candidate information because:

- resumes are self-reported
- professional profiles are easy to exaggerate
- AI-generated resumes and application spam are increasing
- employment and education checks are slow and manual
- recruiters use fragmented tools for verification
- candidates repeatedly upload the same proof across applications

There is no standard portable trust layer for candidate identity in hiring.

## 4. Vision

Build the trust infrastructure for hiring by creating a reusable verified professional identity that follows the candidate across the labor market.

## 5. Goals

### 5.1 Business Goals

- improve recruiter confidence in candidate quality
- reduce screening time
- reduce false or misleading applications
- create differentiated trust signals in the hiring workflow
- establish a defensible identity and verification layer for talent systems

### 5.2 User Goals

#### Candidates

- prove credibility faster
- avoid repeated manual verification
- reuse verified credentials across jobs
- share a trusted profile instantly

#### Recruiters and Hiring Managers

- evaluate candidates with trusted evidence
- see which claims are verified
- reduce time spent on manual checking
- make better shortlisting decisions earlier

## 6. Personas

### 6.1 Candidate

A job seeker who wants to prove employment, education, and credibility using official records and verified endorsements.

Needs:

- easy upload of official proof
- clear verification status
- reusable verified identity
- privacy controls
- recruiter-friendly sharing experience

### 6.2 Recruiter

A talent professional screening high candidate volumes and needing fast confidence signals.

Needs:

- quick trust summary
- visibility into verified versus non-verified claims
- faster candidate triage
- standardized candidate records

### 6.3 Hiring Manager

A decision-maker who needs confidence that shortlisted candidates are legitimate and aligned.

Needs:

- evidence-backed work history
- trusted education and certification proof
- endorsement credibility
- clean review interface

### 6.4 Verification Operations Admin

An internal or partner reviewer who handles edge cases, flagged documents, and manual review.

Needs:

- audit trail
- review queue
- source history
- fraud detection signals

## 7. Product Structure

The platform is structured as one core identity product with five supporting verification and sharing products.

### 7.1 Product 1: Agent Identity Profile

The persistent candidate identity layer.

Includes:

- unique Agent ID
- candidate verification dashboard
- structured professional identity record
- privacy controls
- recruiter share view
- QR code identity link

### 7.2 Product 2: Employment Verification

Verifies prior work history using official documents, employer agents, or human-authorized representatives.

Verification methods:

- uploaded offer letter
- official company document with signature or letterhead
- agent-to-agent verification with employer systems
- agent-to-human verification with HR or hiring manager

Core data captured:

- employer name
- title
- start date
- end date
- document source
- verifier source
- verification timestamp
- evidence file

### 7.3 Product 3: Education Verification

Verifies school attendance, degree completion, and academic credentials.

Verification methods:

- official diploma upload
- transcript or institution letter upload
- agent-to-institution verification
- verified external registrar source

Core data captured:

- institution
- degree or program
- major or field
- completion date
- proof source
- verification status

### 7.4 Product 4: Certification Verification

Verifies professional certifications, licenses, and skills-based credentials.

Verification methods:

- official certificate upload
- certification ID lookup
- agent-to-institution verification
- public registry validation where available

Core data captured:

- issuing body
- certification name
- issue date
- expiration date
- credential ID
- verification method
- status

### 7.5 Product 5: Endorsement Verification

Creates a more trusted alternative to lightweight social endorsements.

Verification methods:

- secure endorsement request and submission workflow
- verified identity for the endorser
- relationship context validation where possible
- employer overlap cross-check where possible

Core data captured:

- endorser name
- title
- relationship to candidate
- company overlap
- years worked together
- endorsement text
- endorsement verification tier

### 7.6 Product 6: Shareable Trust Layer

Allows the candidate to share their verified identity through a recruiter-safe profile or QR code.

Includes:

- Agent QR code
- shareable URL
- verification summary
- permissioned profile snapshot
- recruiter-facing trust report

## 8. Product Principles

- trust must be explicit
- verified and self-reported data must be visually distinct
- candidates control sharing
- provenance must be auditable
- workflows must reduce friction
- confidence levels must be honest and explainable
- the product should scale from manual verification to agentic verification

## 9. User Experience Flows

### 9.1 Candidate Flow

1. Candidate signs up.
2. Candidate receives an Agent ID.
3. Candidate uploads employment, education, and certification documents.
4. Platform parses and structures the data.
5. Candidate sees verification status by category.
6. Candidate requests endorsements.
7. Candidate receives an Agent QR code.
8. Candidate shares the verified identity with a recruiter.

### 9.2 Recruiter Flow

1. Recruiter opens the candidate trust profile.
2. Recruiter sees a verification summary.
3. Recruiter reviews employment, education, certifications, and endorsements.
4. Recruiter sees verification method and confidence level.
5. Recruiter uses verified signals during shortlisting.

### 9.3 Agent-to-Agent Verification Flow

1. Candidate grants consent.
2. Candidate agent initiates a request to an employer or institution agent.
3. Source agent confirms allowed data fields.
4. Verification result is returned.
5. Soul Record is updated.
6. Audit log is stored.

### 9.4 Agent-to-Human Verification Flow

1. Candidate identifies an authorized human source.
2. Agent reaches out to the source.
3. Human uploads official proof or confirms details.
4. System stores source identity, document, and interaction metadata.
5. Verification team or rules engine confirms credibility.
6. Candidate profile updates status.

## 10. Functional Requirements

### 10.1 Candidate Identity

- The system must create a unique Agent ID for every candidate.
- The system must support a persistent identity record across applications.
- The system must store all verification categories under one identity object.

### 10.2 Document Upload

- The system must support upload of PDF, PNG, JPG, and common document types.
- The system must store the original uploaded artifact.
- The system must extract structured metadata from documents.
- The system must support document versioning.

### 10.3 Verification Status Engine

The system must support the following statuses:

- not submitted
- submitted
- parsing complete
- pending review
- partially verified
- verified
- rejected
- expired
- needs update

### 10.4 Employment Verification

- The system must allow upload of official employment documents.
- The system must parse employer name, title, and dates where possible.
- The system must support future employer agent verification.
- The system must log the source and method of verification.

### 10.5 Education Verification

- The system must support educational proof upload.
- The system must store institution, degree, and completion fields.
- The system must support future institution verification workflows.

### 10.6 Certification Verification

- The system must support certificate document upload.
- The system must store issuing body, certification name, issue date, and expiration date.
- The system must support renewal or expiration flags.

### 10.7 Endorsements

- The system must support sending endorsement requests.
- The system must allow endorsers to submit relationship details.
- The system must distinguish verified from unverified endorsements.

### 10.8 Agent QR and Share Layer

- The system must generate a unique QR code per candidate.
- The system must support permissioned recruiter views.
- The system must allow candidates to control shared visibility by record type.

### 10.9 Audit Trail

- The system must store verification event logs.
- The system must record timestamp, source, method, and actor.
- The system must support admin review of record history.

## 11. Non-Functional Requirements

- secure document storage
- encryption at rest and in transit
- role-based access control
- privacy-first permissions
- scalable architecture for large candidate volumes
- high reliability for recruiter-facing views
- traceable audit history
- explainable verification results

## 12. Data Model Concept

### 12.1 Core Object: Agent Identity Record

Contains:

- candidate profile ID
- Agent ID
- QR code ID
- share settings
- verification summary
- category records
- audit history

### 12.2 Sub-Objects

#### Employment Record

- employer
- title
- start date
- end date
- evidence artifact
- verification source
- verification status

#### Education Record

- institution
- credential
- field of study
- graduation date
- evidence artifact
- status

#### Certification Record

- certificate name
- issuer
- issue date
- expiration date
- credential ID
- status

#### Endorsement Record

- endorser identity
- relationship
- company overlap
- endorsement text
- endorsement tier
- status

## 13. Verification Model

The platform should never overstate certainty. Verification must be understandable, conservative, and auditable.

### 13.1 Verification Levels

- **Self-Reported**
- **Evidence Submitted**
- **Reviewed**
- **Source Verified**
- **Multi-Source Verified**

### 13.2 Example Progression

A candidate uploads an offer letter:

- Evidence Submitted

A reviewer validates document authenticity:

- Reviewed

An employer agent confirms dates:

- Source Verified

An employer agent and official uploaded proof match:

- Multi-Source Verified

## 14. Scope

### 14.1 MVP Objective

Launch a working trust layer that proves candidates and recruiters will use verified identity signals in early-stage hiring.

### 14.2 MVP Features

Core:

- candidate onboarding
- Agent ID creation
- candidate profile dashboard
- document upload and storage
- parsing and structured field extraction
- verification status labels
- recruiter view
- Agent QR code
- audit logs

Verification:

- employment document verification
- education document verification
- certification document verification
- basic endorsement request and submission flow

Admin:

- review queue
- manual verification update
- fraud or flag status

### 14.3 V1 Expansion

- agent-to-agent verification with employers
- agent-to-institution verification
- agent-to-human guided verification workflows
- recruiter integrations
- stronger endorsement trust logic
- expiration and renewal handling
- candidate trust score components
- employer-facing verification requests

### 14.4 Out of Scope for MVP

- full background checks
- criminal screening
- payroll integrations
- full ATS marketplace integrations
- global legal verification automation
- blockchain credential wallet
- automated trust scoring as the primary decision system

## 15. Success Metrics

### 15.1 Candidate Metrics

- signup to profile completion rate
- percentage of candidates who upload at least one official document
- percentage of candidates with one or more verified records
- QR or share usage rate
- repeat use across multiple applications

### 15.2 Recruiter Metrics

- recruiter profile view rate
- verification engagement rate
- reduced manual screening time
- increase in shortlist confidence
- recruiter satisfaction score

### 15.3 Verification Metrics

- average time to verify a record
- verification completion rate by type
- false submission or fraud flag rate
- percentage of records verified through source-confirmed methods

### 15.4 Business Metrics

- recruiter adoption
- candidate adoption
- verified candidate conversion to interview
- verified candidate conversion to offer
- retention of active users

## 16. Risks and Mitigations

### 16.1 Fake Documents

Mitigation: fraud review queue, metadata checks, confidence tiers, and multi-source verification.

### 16.2 Employer and Institution Integration Gaps

Mitigation: start with document workflows and expand to agent-to-agent verification later.

### 16.3 Candidate Friction

Mitigation: progressive verification, clear UX, and reuse of prior proof.

### 16.4 Privacy Concerns

Mitigation: permissioned sharing, candidate controls, and strict access logging.

### 16.5 Endorsement Abuse

Mitigation: identity verification, relationship validation, and anti-spam controls.

## 17. Open Product Questions

- What fields should be visible by default to recruiters?
- Should candidate consent be required per verification request or set globally?
- Should endorsements affect ranking or only act as supporting evidence?
- Is the Agent QR a live link or a fixed snapshot?
- How should expired certifications appear in recruiter views?
- What is the threshold for "verified" versus "reviewed"?

## 18. Acceptance Criteria

### 18.1 Agent ID

- Candidate can create an account and receive a unique Agent ID.
- Candidate can access a dashboard showing all verification categories.

### 18.2 Employment Upload

- Candidate can upload an offer letter or official work document.
- System stores the original file.
- System extracts basic fields where possible.
- Record appears with status shown clearly.

### 18.3 Education and Certification Upload

- Candidate can upload credential proof.
- System stores the credential with structured fields.
- Recruiter can view status in the profile summary.

### 18.4 Endorsements

- Candidate can request an endorsement.
- Endorser can submit the endorsement.
- Endorsement displays its verification tier.

### 18.5 Recruiter View

- Recruiter can view the candidate trust summary.
- Verified records are visually distinct from self-reported claims.
- Source and method of verification are visible.

### 18.6 QR Share

- Candidate can generate a QR code.
- QR code opens a shareable trust page.
- Shared page respects privacy settings.

## 19. Feature Prioritization

### 19.1 Must Have

- Agent ID
- document upload
- employment verification records
- education verification records
- certification verification records
- recruiter trust view
- QR code
- audit trail

### 19.2 Should Have

- endorsements
- admin review queue
- source labels
- permission controls

### 19.3 Could Have

- automated human outreach
- trust scoring
- external integrations
- institution APIs
- candidate verification reminders

## 20. Positioning

### 20.1 Internal Positioning

A trust infrastructure layer for hiring that makes candidate identity portable, verified, and reusable.

### 20.2 External Positioning

A verified professional identity platform that helps candidates prove credibility and helps recruiters hire with confidence.

## 21. Naming System

Recommended naming:

- **Platform name**: Agent Identity Platform
- **Candidate record**: Agent ID
- **Internal data layer**: Soul Record
- **Share object**: Agent QR

This naming model keeps the external product understandable while preserving clear internal system language.
