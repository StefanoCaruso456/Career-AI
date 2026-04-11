# Employer Agent Sourcer PRD

Status: Draft  
Version: v1  
Date: April 10, 2026  
Owner: Product Management

## 1. Executive Summary

The **Employer Agent Sourcer** is the employer-side candidate evaluation client for Career AI. It is not a generic chatbot. It is a recruiter-side verification and candidate intelligence agent that turns a **Career ID** into trusted hiring signals.

The product is designed to function as a recruiter's operating system for candidate evaluation. Instead of making recruiters manually dig through resumes, documents, endorsements, and verification artifacts, the Agent Sourcer should retrieve candidate evidence, reason over trust and fit, identify missing proof, and return recruiter-ready outputs.

The first product release should focus on four high-value actions:

- Career ID lookup
- verified candidate summary
- job matching
- missing evidence requests

This creates immediate recruiter value without overbuilding the full employer automation stack on day one.

## 2. Product Framing

The Agent Sourcer should be positioned as:

> a recruiter-side verification and candidate intelligence agent that turns a Career ID into trusted hiring signals

This framing is stronger than describing it as an AI assistant or a chatbot because it emphasizes:

- permissioned access to candidate trust data
- structured evaluation workflows
- enterprise-grade controls
- recruiter outcomes instead of conversational novelty

## 3. Problem Statement

Recruiters and hiring teams increasingly face a candidate evaluation problem defined by:

- too much low-trust candidate information
- too much manual review of documents and claims
- weak differentiation between verified and self-claimed facts
- inconsistent evidence quality across candidates
- missing proof at the exact moment a recruiter needs confidence
- too much time spent formatting a recruiter-ready summary after the real investigative work is already done

Today, even when candidate evidence exists, recruiters still act as the retrieval layer, the reasoning layer, and the formatting layer. That is slow, expensive, inconsistent, and difficult to scale.

## 4. Vision

Build the employer-side operating system for candidate credibility review so that a recruiter can move from **Career ID** to **trusted hiring signal** with minimal manual digging.

The Agent Sourcer should:

- resolve a candidate quickly
- verify access permissions before revealing data
- assemble a structured credibility profile
- summarize verified history and evidence
- compare evidence to job requirements
- identify missing proof
- request missing proof through agent-to-agent workflows
- package the result into a recruiter-ready output

## 5. Goals

### 5.1 Business Goals

- make the employer persona feel like a distinct product, not a reused candidate client
- create a recruiter-side product surface that justifies enterprise adoption
- increase the value of Career ID by making it actionable for hiring teams
- create a foundation for employer policy, recruiter memory, and A2A orchestration
- support future integrations with ATS, verification partners, and recruiter workflows

### 5.2 User Goals

#### Recruiters

- evaluate candidate credibility faster
- see what is verified versus self-claimed
- identify missing evidence before interviews
- generate recruiter-ready summaries and shortlists

#### Hiring Teams

- standardize what evidence matters for a role
- compare candidates against structured job requirements
- reduce manual screening effort
- enforce consistent hiring trust policy across the team

#### Employers

- configure evidence and trust policies by team or region
- control what the recruiting agent can access and do
- retain an audit trail for every candidate evaluation request

## 6. Primary Persona

### 6.1 Recruiter / Talent Acquisition Team

The primary user is a recruiter or talent acquisition team operating on behalf of an employer. They need a structured workspace that reflects company policy, role requirements, and permission scope.

They do not want to configure prompts. They want to configure business workflow.

They care about:

- trust policy
- evidence policy
- role fit
- permissioned access
- recruiter-ready outputs

## 7. Product Principles

- do not make the recruiter configure raw prompts
- make configuration feel like business workflow setup
- clearly separate verified facts from self-claimed facts
- enforce consent and access scope before retrieval
- log every meaningful access and request
- make outputs recruiter-ready by default
- design for employer policy and future enterprise controls from the start

## 8. Core Jobs To Be Done

The Agent Sourcer must perform these core jobs:

1. Resolve Candidate ID
2. Verify identity and access permissions
3. Pull candidate credibility profile
4. Summarize verified background
5. Match candidate to a job
6. Detect missing evidence
7. Request more information from the candidate agent
8. Package recruiter-ready output

## 9. Product Structure

### 9.1 Recruiter Agent Shell

The Agent Sourcer should be anchored in a recruiter-side agent shell that feels like the employer's recruiting assistant rather than a generic chatbot.

The shell should hold:

- employer account
- recruiter or team identity
- company policies
- hiring focus and role coverage
- evidence preferences
- permission scope
- audit logs of every request

This shell is the top-level employer-side agent surface and should provide the context for all downstream actions.

### 9.2 What Recruiters Configure

Recruiters should configure business rules, not model prompts. Day-one setup should include:

- Agent name
- Team or company
- Roles hired for
- Must-have evidence
- Preferred evidence
- Trust threshold
- Permissions allowed
- Output format
- Follow-up request style

## 10. Day-One Recruiter Setup

### 10.1 Agent Identity

The recruiter should configure:

- agent name
- recruiter team name
- employer or company name
- department or business unit
- hiring region
- who can use the agent

Example:

- Agent name: Projectz Recruiting Agent
- Team: Talent Acquisition
- Region: US
- Purpose: Source and evaluate candidates from Career IDs

### 10.2 Hiring Focus

The recruiter should define:

- roles they hire for
- departments
- seniority ranges
- required credentials
- preferred evidence types

Example:

- Engineering
- Product
- AI/ML
- Require employment verification, portfolio, and referral
- Prefer manager letter or official HR proof

### 10.3 Evidence Policy

The recruiter should choose what evidence the agent values most.

Example toggles:

- prioritize official employer letters
- accept self-reported information only as low trust
- require referral before interview
- require certification proof for regulated roles
- require identity verification before advancing

### 10.4 Access Permissions

The recruiter should define what the agent is allowed to do:

- read candidate summaries
- read verified evidence only
- request additional information
- compare against open jobs
- create shortlist notes
- export evaluation packet

Default behavior should not expose everything to everyone.

### 10.5 Output Preferences

The recruiter should choose how results are returned:

- concise candidate summary
- job-fit scorecard
- missing evidence checklist
- interview readiness report
- risk flags
- candidate comparison view

## 11. Core Skills

### 11.1 Identity and Retrieval Skills

#### Candidate ID Resolver

Purpose:

- takes a Career ID
- finds the matching candidate record in the database
- validates existence, status, and consent scope

#### Candidate Profile Reader

Purpose:

- pulls structured candidate overview
- retrieves work history, education, certifications, referrals, and verified documents

#### Evidence Inventory Reader

Purpose:

- shows what evidence exists and what level of trust it has
- distinguishes evidence by trust level such as self-reported, employer letter, HR verified, or third-party verified

### 11.2 Verification and Trust Skills

#### Credibility Scorer

Purpose:

- scores the trust level of each claim
- separates verified facts from self-claimed facts

#### Document Verifier

Purpose:

- checks documents attached to the Career ID
- supports offer letters, HR letters, referrals, promotions, licenses, and certifications

#### Consent and Access Guard

Purpose:

- ensures the recruiter only sees what the candidate has allowed
- enforces scoped, logged, explainable access

### 11.3 Recruiting Workflow Skills

#### Job Match Analyzer

Purpose:

- compares verified candidate evidence against a job requirement
- returns fit, gaps, strengths, and missing proof

#### Candidate Summary Writer

Purpose:

- generates recruiter-ready summaries
- highlights verified employment history, trusted endorsements, and unverified gaps

#### Gap Finder

Purpose:

- identifies what is missing for recruiter confidence
- examples include missing manager reference, no proof of recent title, or expired certification

#### Follow-up Request Generator

Purpose:

- creates structured requests for missing evidence
- example: request verified manager letter for a specific employment period

### 11.4 Communication and Orchestration Skills

#### Candidate Agent Messenger

Purpose:

- sends structured requests to the candidate-side agent
- supports A2A requests for documents, proof, clarification, and authorization

#### Workflow Orchestrator

Purpose:

- sequences the core flow
- lookup -> permissions -> retrieve evidence -> summarize -> match -> request missing items

#### Audit Logger

Purpose:

- records who requested what and why
- provides compliance and trust visibility for enterprise customers

## 12. MVP vs Later Phases

### 12.1 MVP Skills

Start with these six:

- Candidate ID Resolver
- Candidate Profile Reader
- Evidence Inventory Reader
- Job Match Analyzer
- Candidate Summary Writer
- Follow-up Request Generator

### 12.2 Phase 2

Add:

- Credibility Scorer
- Document Verifier
- Consent and Access Guard
- Audit Logger
- Candidate Agent Messenger

### 12.3 Phase 3

Add:

- multi-candidate comparison
- automatic shortlist recommendations
- recruiter memory and preferences
- ATS sync
- background verification partner integrations

## 13. UI Structure

The Agent Sourcer page should feel like an employer operating surface with four major sections.

### 13.1 Recruiter Agent Profile

Top panel should show:

- Recruiter Agent name
- employer team
- configured trust policy
- active skills
- last sync or last update

### 13.2 Candidate Lookup

Main action box should support:

- entering a Career ID
- pasting a candidate link
- later, uploading a candidate packet

After submission, the system should:

- locate the candidate record
- confirm access scope
- load the credibility profile

### 13.3 Candidate Intelligence Workspace

This becomes the main recruiter work surface.

Tabs should include:

- Overview
- Verified Experience
- Documents
- Referrals / Endorsements
- Job Match
- Missing Items
- Agent Requests
- Audit Trail

### 13.4 Recruiter Actions

Primary actions should include:

- Analyze fit for this role
- Request more evidence
- Generate candidate brief
- Compare to job requirements
- Save to shortlist
- Send structured request to candidate agent

## 14. Primary Workflow

The first clean recruiter workflow should be:

1. Recruiter enters Career ID
2. System resolves candidate record
3. System checks permission and consent scope
4. System loads the candidate's verified credibility graph
5. System summarizes work history, education, endorsements, and documents
6. Recruiter selects a job
7. Agent matches candidate to the job
8. Agent returns:
   - strengths
   - verified proof
   - gaps
   - missing evidence
9. Recruiter requests more proof from the candidate agent if needed
10. System logs all actions

This should be the first true MVP workflow.

## 15. Outputs

The Agent Sourcer should return outputs that are directly usable by recruiters. Supported output patterns should include:

- recruiter-ready summary
- verified background summary
- job-fit scorecard
- missing evidence checklist
- interview readiness report
- risk flags
- candidate comparison view

## 16. Permissions, Consent, and Audit

This product should enforce:

- candidate consent before sensitive access
- scoped recruiter access by role, team, and policy
- explainable evidence exposure
- logged agent actions for every request and follow-up
- enterprise-ready audit trails

These controls are core product requirements, not optional later polish.

## 17. Non-Goals for MVP

The first release should not attempt to deliver everything at once. Out of scope for MVP:

- full recruiter memory system
- broad ATS write-back actions
- partner background check integrations
- automatic shortlist generation
- multi-candidate comparison across large pools
- advanced employer policy engine beyond basic evidence and trust settings

## 18. Success Criteria

The MVP should be considered successful if it enables a recruiter to:

- resolve a candidate from Career ID without manual back-and-forth
- distinguish verified from self-claimed evidence
- receive a recruiter-ready summary without manual synthesis
- compare candidate credibility to a job requirement
- identify missing evidence before advancing a candidate
- request that missing evidence in a structured way

## 19. Open Questions

- What is the minimum viable employer policy model for launch?
- How should trust thresholds be exposed without overwhelming recruiters?
- What evidence types should be mandatory by role family?
- What should the first recruiter-ready export format be?
- When should employer-side memory become part of the product?
- Which ATS integration should be prioritized first after MVP?

## 20. Recommendation

Build the Employer Agent Sourcer first as:

- Career ID lookup
- verified candidate summary
- job matching
- missing evidence requests

Then layer in:

- A2A messaging
- recruiter memory
- employer policy engine
- ATS actions
- deeper workflow automation
