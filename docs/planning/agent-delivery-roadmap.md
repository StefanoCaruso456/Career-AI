# Agent Identity Platform Roadmap and Parallel Agent Plan

Status: Draft
Version: v1
Date: April 7, 2026
Audience: Product, Engineering, Design, Architecture, and AI Agent Builders

## 1. Purpose

This document defines the delivery roadmap, increment plan, isolated agent execution model, and handoff contracts for building the Agent Identity Platform.

It is intended to make parallel execution safe by:

- defining clear phases and release goals
- separating work into bounded workstreams
- requiring stable shared contracts before implementation
- specifying narrow ownership for isolated agents
- standardizing handoff artifacts between teams

Core platform objects:

- **Agent ID**
- **Soul Record**
- **Agent QR**

## 2. Planning Principles

The platform should be built with a modular, contract-first architecture so isolated agents can work in parallel without breaking the system.

Core planning principles:

- define interfaces before implementation
- isolate domains by ownership
- keep data contracts stable
- prefer async, event-driven boundaries where possible
- build the core trust model before advanced automation
- ship manual and semi-automated workflows before full agent-to-agent automation
- require each phase to deliver usable business value
- assign each team or agent a narrow surface area with explicit inputs and outputs

## 3. Delivery Layers

The platform should be built in layers instead of all at once.

### 3.1 Layer 1: Trust Foundation

Create the candidate identity object, evidence storage, verification states, recruiter read view, and admin review workflow.

### 3.2 Layer 2: Verification Workflows

Add structured verification flows for employment, education, certifications, and endorsements.

### 3.3 Layer 3: Agentic Verification

Add agent-to-agent and agent-to-human orchestration on top of stable verification primitives.

### 3.4 Layer 4: Scale and Ecosystem

Add ATS integrations, institution integrations, employer integrations, trust scoring, and reusable partner APIs.

## 4. Phase Roadmap

## Phase 0: Foundation and Architecture

### Goal

Define the operating model, architecture, contracts, security model, and domain ownership before parallel implementation starts.

### Outcomes

- finalized MVP scope
- system architecture
- domain boundaries
- API contracts
- event contract definitions
- data model
- verification taxonomy
- access control model
- compliance and privacy requirements
- implementation backlog by workstream

### Deliverables

- architecture specification
- product specification
- data model specification
- event model specification
- agent execution contracts
- security requirements
- UI information architecture
- roadmap and milestone plan

### Exit Criteria

- all core services and ownership boundaries are approved
- no critical ambiguity remains in data contracts
- engineering can start in parallel safely

## Phase 1: Core Platform and Soul Record

### Goal

Build the minimum system that creates and stores the candidate identity layer.

### Scope

- candidate account creation
- Agent ID creation
- Soul Record creation
- profile shell
- secure document upload
- file storage
- metadata extraction pipeline
- recruiter-safe read model
- admin review console foundation
- basic QR generation
- audit logging

### Business Value

This creates the persistent identity system and evidence storage layer required for all future verification features.

### Deliverables

- candidate identity service
- Soul Record schema implementation
- upload service
- storage abstraction
- audit service
- recruiter profile read page
- candidate dashboard foundation
- QR identity page v1

### Exit Criteria

- candidate can create an account and receive an Agent ID
- candidate can upload files
- files attach to the Soul Record
- recruiter can view a basic trust summary
- admin can review uploaded records
- audit log exists for all critical actions

## Phase 2: Verification Products MVP

### Goal

Turn raw uploads into structured verification records across the major credential categories.

### Scope

- employment verification workflow
- education verification workflow
- certification verification workflow
- endorsement workflow
- verification status engine
- manual review workflow
- source attribution and provenance display

### Business Value

This is the first phase where recruiters see meaningful candidate trust differentiation.

### Deliverables

- employment record service
- education record service
- certification record service
- endorsement service
- verification state machine
- provenance model
- recruiter trust summary UI
- candidate verification dashboard UI

### Exit Criteria

- candidate can submit all major record types
- system displays clear verification status for each
- recruiter can distinguish self-reported, evidence-submitted, and reviewed records
- admin can approve, reject, or flag records

## Phase 3: Agentic Verification

### Goal

Add automation and external trust workflows.

### Scope

- agent-to-agent verification orchestration
- agent-to-human verification orchestration
- request management
- consent workflow
- outbound verification requests
- institution and employer connector framework
- verification result ingestion

### Business Value

Moves the system from passive proof storage to active trust automation.

### Deliverables

- verification orchestration service
- consent service
- outbound request manager
- source response handler
- employer verification adapter pattern
- institution verification adapter pattern
- human verification request flow
- external verification audit trail

### Exit Criteria

- candidate can authorize a verification request
- system can initiate a verification workflow
- results can return and update the Soul Record
- recruiter sees source-verified records separately from document-reviewed records

## Phase 4: Platform Expansion and Scale

### Goal

Turn the platform into a reusable hiring trust infrastructure.

### Scope

- ATS integrations
- API platform for recruiters and partners
- candidate trust score components
- automated renewal reminders
- certification expiration workflows
- shareable trust packets
- enterprise admin controls
- analytics and reporting

### Business Value

This is the monetization and scale layer.

### Deliverables

- partner API
- ATS integration adapters
- enterprise dashboard
- recruiter analytics
- trust insights
- verification SLA monitoring
- support tooling

### Exit Criteria

- third-party systems can consume verified data
- recruiters can operationalize trust data in hiring workflows
- enterprise customers can manage verification at scale

## 5. Release Structure

## Release 1: Trust Foundation MVP

Shippable product:

- Agent ID
- Soul Record
- document upload
- basic structured records
- recruiter view
- admin review
- Agent QR

## Release 2: Verified Candidate Profile

Shippable product:

- employment verification
- education verification
- certification verification
- endorsements
- clearer provenance
- review workflows

## Release 3: Agentic Trust Network

Shippable product:

- agent-to-agent verification
- agent-to-human verification
- request orchestration
- institutional verification framework

## 6. Workstreams for Parallel Delivery

Work should be divided into isolated workstreams with explicit ownership.

### Workstream A: Identity and Soul Record

Owns:

- Agent ID
- candidate profile model
- Soul Record schema
- candidate settings
- privacy settings

### Workstream B: Evidence and Document Infrastructure

Owns:

- uploads
- storage
- metadata extraction
- file lifecycle
- document security

### Workstream C: Verification Domain Engine

Owns:

- verification state machine
- provenance model
- confidence tiers
- review actions
- approval and rejection logic

### Workstream D: Credential Domains

Owns:

- employment records
- education records
- certification records
- endorsement records

### Workstream E: Recruiter and Hiring Manager Experience

Owns:

- recruiter read views
- trust summary UI
- verification detail UI
- QR share experience

### Workstream F: Admin and Operations

Owns:

- review queue
- manual verification tools
- fraud flagging
- source history
- audit admin views

### Workstream G: Agentic Orchestration

Owns:

- agent-to-agent verification orchestration
- agent-to-human orchestration
- consent workflows
- external request lifecycle

### Workstream H: Platform, Security, and Observability

Owns:

- authentication
- RBAC
- audit logs
- metrics
- tracing
- privacy and compliance controls

## 7. Isolated Agent Execution Model

Each isolated agent should operate independently within a defined contract.

Execution rules:

- each agent owns one bounded domain
- agents may read shared contracts but may only write in owned domains
- agents communicate through explicit artifacts rather than implicit assumptions
- no agent may redefine shared object schemas without contract approval
- all outputs must include tests, interface documentation, and integration notes
- any shared contract change requires architecture review

## 8. Parallel Agent Spec Sheet

## Agent 1: Product Spec Agent

### Mission

Convert product vision into execution-ready requirements and acceptance criteria.

### Owns

- PRD refinement
- feature requirement docs
- user stories
- acceptance criteria
- edge case inventory
- release definitions

### Inputs

- product vision
- roadmap
- stakeholder goals

### Outputs

- feature specifications
- user flows
- acceptance criteria by feature
- prioritized backlog

### Dependencies

- none for initial output
- later synchronization with architecture and design

### Done When

- every feature has scope, rules, and acceptance criteria

## Agent 2: Architecture Agent

### Mission

Define system boundaries, service decomposition, data flow, and integration contracts.

### Owns

- service architecture
- domain boundaries
- API strategy
- event strategy
- deployment topology
- integration contracts

### Inputs

- PRD
- product workflows
- security requirements

### Outputs

- architecture specification
- service map
- API contracts
- event contracts
- sequence diagrams

### Dependencies

- product specification artifacts

### Done When

- all major domains and system boundaries are defined

## Agent 3: Data Model Agent

### Mission

Define canonical schemas for the Soul Record and all verification entities.

### Owns

- data model
- schema definitions
- read and write models
- record versioning rules
- provenance model

### Inputs

- product specification
- architecture specification

### Outputs

- ERD
- schema documentation
- object definitions
- field dictionary
- status enum definitions

### Dependencies

- Product Spec Agent
- Architecture Agent

### Done When

- all domain objects are stable enough for service implementation

## Agent 4: Identity Service Agent

### Mission

Build the candidate identity and Soul Record service.

### Owns

- Agent ID generation
- candidate identity APIs
- profile service
- privacy settings
- identity retrieval endpoints

### Inputs

- architecture contract
- schema contract

### Outputs

- service implementation
- tests
- API documentation
- migration scripts

### Dependencies

- Architecture Agent
- Data Model Agent
- Security and Platform Agent

### Done When

- candidate identity lifecycle works end to end

## Agent 5: Document Infrastructure Agent

### Mission

Build evidence upload, storage, parsing, and secure artifact handling.

### Owns

- upload APIs
- file storage
- artifact lifecycle
- parser pipeline integration
- checksum and metadata handling

### Inputs

- schema contract
- security requirements

### Outputs

- upload service
- file metadata service
- parser queue integration
- storage adapter documentation

### Dependencies

- Architecture Agent
- Data Model Agent
- Security and Platform Agent

### Done When

- candidate files can be uploaded, stored, retrieved, and attached to records safely

## Agent 6: Verification Engine Agent

### Mission

Build the shared verification state machine and confidence framework.

### Owns

- verification state transitions
- approval and rejection rules
- source attribution logic
- confidence tiers
- provenance calculations

### Inputs

- product rules
- schema contract

### Outputs

- verification service
- state transition logic
- shared verification library
- test suite

### Dependencies

- Product Spec Agent
- Data Model Agent

### Done When

- all domain records can be evaluated consistently through one verification engine

## Agent 7: Credential Domain Agent

### Mission

Build the employment, education, certification, and endorsement services using the shared verification engine.

### Owns

- employment record workflows
- education record workflows
- certification workflows
- endorsement workflows

### Inputs

- data model
- verification engine
- upload infrastructure

### Outputs

- domain APIs
- record services
- validation logic
- domain tests

### Dependencies

- Document Infrastructure Agent
- Verification Engine Agent
- Data Model Agent

### Done When

- all record types can be created, updated, and reviewed

## Agent 8: Recruiter Experience Agent

### Mission

Build recruiter and hiring manager views for trust evaluation.

### Owns

- recruiter summary UI
- record detail UI
- trust visualization
- QR landing page
- visibility controls in the UI

### Inputs

- read model contracts
- design system
- product rules

### Outputs

- frontend flows
- recruiter screens
- trust summary components
- integration tests

### Dependencies

- Identity Service Agent
- Credential Domain Agent
- design owner if separate

### Done When

- recruiter can review a candidate trust profile end to end

## Agent 9: Admin Operations Agent

### Mission

Build internal tooling for review, fraud flags, and operational verification workflows.

### Owns

- review queue
- decision console
- fraud flags
- provenance inspection
- admin actions

### Inputs

- verification engine
- record schemas
- audit logs

### Outputs

- admin interfaces
- moderation actions
- operations dashboards
- reviewer actions

### Dependencies

- Verification Engine Agent
- Credential Domain Agent
- Security and Platform Agent

### Done When

- internal teams can process, review, and resolve submissions

## Agent 10: Agentic Orchestration Agent

### Mission

Build future-ready automation for agent-to-agent and agent-to-human verification.

### Owns

- verification request orchestration
- consent flow
- external request lifecycle
- response ingestion
- adapter framework

### Inputs

- identity contracts
- verification rules
- external connector model

### Outputs

- orchestration service
- request state machine
- adapter interface specification
- async workflow tests

### Dependencies

- Identity Service Agent
- Verification Engine Agent
- Security and Platform Agent

### Done When

- the system can create, send, track, and resolve verification requests safely

## Agent 11: Security and Platform Agent

### Mission

Provide cross-cutting security, authentication, auditability, and reliability capabilities.

### Owns

- authentication
- RBAC
- encryption patterns
- audit logging
- observability
- secrets management
- privacy controls

### Inputs

- architecture specification
- compliance requirements

### Outputs

- authentication framework
- RBAC policy map
- audit service
- tracing and logging standards
- security checklist

### Dependencies

- Architecture Agent

### Done When

- all services can use common auth, access control, and audit capabilities

## Agent 12: QA and Validation Agent

### Mission

Validate contracts, workflows, regressions, and integration quality across all workstreams.

### Owns

- test strategy
- integration tests
- contract tests
- workflow test matrix
- release validation

### Inputs

- feature specifications
- API contracts
- acceptance criteria

### Outputs

- QA plan
- contract test suites
- integration coverage
- release readiness report

### Dependencies

- all implementation agents

### Done When

- release quality is measurable and stable

## 9. Shared Contracts Required Before Parallel Build

Before implementation begins in parallel, the following artifacts must exist:

- canonical glossary
- bounded domain map
- Soul Record schema
- verification status enum
- confidence tier model
- artifact metadata schema
- recruiter read model contract
- audit event schema
- authentication and RBAC contract
- API naming conventions
- error model
- event naming conventions

Without these contracts, isolated agents will produce incompatible outputs.

## 10. Inter-Agent Handoff Contracts

Each agent must produce handoff artifacts in a standard format so downstream work can proceed without reinterpretation.

### 10.1 Mandatory Handoff Template

Each handoff document must include:

- scope owned
- decisions made
- assumptions
- interfaces exposed
- inputs required
- outputs produced
- unresolved risks
- test coverage
- examples

### 10.2 Handoff Rules

- handoffs must reference the canonical contract versions they implement
- any change to a shared contract must be called out explicitly
- downstream teams may not infer behavior that is not documented in the handoff
- examples must include at least one valid happy path and one failure path
- test coverage must identify contract tests and integration gaps
- unresolved risks must include an owner and a follow-up action

### 10.3 Example Handoff

The Verification Engine Agent should hand off:

- verification state machine
- allowed transitions
- approval and rejection API contract
- confidence tier output format
- domain integration examples

This allows the Credential Domain Agent and Admin Operations Agent to integrate without reinterpreting business logic.

## 11. Suggested Increment Plan

## Increment 1: Architecture and Contracts

Teams active:

- Product Spec Agent
- Architecture Agent
- Data Model Agent
- Security and Platform Agent

Goal:

- define the platform clearly enough for safe parallel build

## Increment 2: Core Platform

Teams active:

- Identity Service Agent
- Document Infrastructure Agent
- Recruiter Experience Agent
- Admin Operations Agent
- QA and Validation Agent

Goal:

- deliver working Agent ID, Soul Record, upload system, recruiter view, and admin console shell

## Increment 3: Verification Domain MVP

Teams active:

- Verification Engine Agent
- Credential Domain Agent
- Recruiter Experience Agent
- Admin Operations Agent
- QA and Validation Agent

Goal:

- deliver structured verification across employment, education, certification, and endorsements

## Increment 4: Agentic Verification

Teams active:

- Agentic Orchestration Agent
- Verification Engine Agent
- Security and Platform Agent
- QA and Validation Agent

Goal:

- deliver orchestrated external verification requests and response handling

## Increment 5: Integrations and Scale

Teams active:

- Agentic Orchestration Agent
- Recruiter Experience Agent
- Security and Platform Agent
- QA and Validation Agent

Goal:

- deliver external system integrations, analytics, and enterprise readiness

## 12. Dependency Map

Recommended order of execution:

1. product specification
2. architecture
3. data model
4. security model
5. identity service
6. document infrastructure
7. verification engine
8. credential domains
9. recruiter and admin experiences
10. orchestration
11. partner integrations

This order reduces rework and contract churn.

## 13. Engineering Guardrails

### 13.1 Technical Guardrails

- do not couple recruiter UI directly to write models
- use explicit read models for recruiter summary pages
- use one shared verification engine across all credential types
- store raw evidence separately from structured extracted fields
- preserve provenance for every record mutation
- use async workflows for parsing and external verification
- make audit logging non-optional for sensitive actions
- every service must expose health, metrics, and trace hooks
- avoid embedding business rules only in frontend logic

### 13.2 Product Guardrails

- never show a claim as verified unless the verification source supports it
- self-reported and verified data must be visually distinct
- candidate must control what is shared externally
- endorsement credibility must not equal official document credibility
- the product must remain useful even before agent-to-agent integrations exist

## 14. Risks in Parallel Agent Execution

## Risk 1: Schema Drift

Multiple agents define overlapping object fields differently.

Mitigation:

- canonical schema ownership belongs only to the Data Model Agent

## Risk 2: Duplicated Business Logic

Different teams implement verification states differently.

Mitigation:

- centralize verification logic in one shared verification engine

## Risk 3: UI Misrepresents Trust

Frontend surfaces simplify or mislabel trust states.

Mitigation:

- define trust display rules in the product specification and verify them in QA

## Risk 4: Async Orchestration Complexity Too Early

Agent-to-agent flows can slow MVP delivery if introduced too soon.

Mitigation:

- keep orchestration out of the MVP critical path

## Risk 5: Security Gaps Across Services

Multiple teams implement authentication and auditability differently.

Mitigation:

- Security and Platform Agent owns shared auth, RBAC, and audit libraries centrally

## 15. Definition of Done by Phase

## Phase 0 Done

- all contracts are approved
- backlog is sequenced
- ownership is assigned

## Phase 1 Done

- candidate identity exists
- Soul Record persists
- file upload works
- recruiter can view the trust shell
- admin can inspect records

## Phase 2 Done

- employment, education, certification, and endorsement workflows operate
- verification statuses appear correctly
- reviewer actions work

## Phase 3 Done

- verification requests can be sent externally
- source-confirmed results update records
- consent and auditability exist

## Phase 4 Done

- third-party systems can consume and act on verified data
- platform is enterprise-ready

## 16. Recommended Team Structure

### Human Owners

- 1 senior product manager
- 1 staff or principal architect
- 1 engineering lead per major workstream
- 1 design lead
- 1 security and platform lead

### AI or Isolated Agent Workers

- specification-writing agents
- service implementation agents
- test agents
- documentation agents
- integration agents

Humans should own:

- priorities
- contracts
- architecture approvals
- security approvals
- launch decisions

Agents should own:

- drafting specifications
- generating implementation scaffolds
- writing tests
- documenting APIs
- building isolated bounded-domain services

## 17. Most Important Recommendation

Do not start with full agent-to-agent verification first.

Recommended sequence:

1. build the **Soul Record**
2. build **document ingestion and structured records**
3. build the **verification state engine**
4. build the **recruiter trust view**
5. then layer in **agentic verification orchestration**

This sequence creates usable product value earlier, lowers technical risk, and establishes a stable foundation for parallel teams.
