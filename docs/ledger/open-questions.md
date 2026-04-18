# Career Ledger — Open Questions

**Status**: Phase T0 · Active

Questions to resolve during T0 before starting T1 implementation.

## Protocol

- [x] **DID method** — **DECIDED**: `did:web` for the platform issuer, `did:key` for user holders. Rationale: `did:web` gives us a stable, human-resolvable issuer identifier tied to a real domain; `did:key` gives holders a portable, infrastructure-free identifier that works with any compliant wallet. `did:ethr` is reserved for Phase T8 evaluation.
- [x] **Domain layout** — **DECIDED**: single brand domain with purpose-specific subdomains. Placeholder `career-ledger.example` baked into specs. Layout: apex or `app.` for user-facing product, `schemas.` for badge schemas, `status.` for revocation lists, issuer DID hosts its `/.well-known/did.json` at the apex. Eventual protocol/company separation handled as a graceful DID rotation (new issuer DID on a dedicated protocol domain, old DID keeps serving historical credentials).
- [ ] **Actual domain string** — deferred. `career-ledger.example` placeholder sticks until a real domain is registered. Find-replace is the migration path.
- [ ] **Selective disclosure library** — evaluate Microsoft Entra Verifiable Credentials, Spruce didkit/ssi, Veramo. Criteria: SD-JWT-VC support, TypeScript bindings, license compatibility, maintenance activity.
- [ ] **Canonical JSON serialization** — JCS (RFC 8785) vs. JSON-LD normalization. Affects `vcHash` stability. Current lean: JCS.

## Identity proofing

- [ ] **ID.me vs alternatives** — Persona, Stripe Identity, Clear, Incode. Criteria: cost per verification, supported countries, API quality, enterprise trust, terms for downstream DID issuance.
- [ ] **Recovery flow when a user loses their passkey** — require re-proofing via the same identity provider? Social recovery via endorsers? Hardware token backup?

## Wallet

- [ ] **Backup posture** — hard-require user backup before onboarding completes, or soft-encourage with reminders? Tradeoff: friction vs durability.
- [ ] **Backup location options** — iCloud, Google Drive, Dropbox, self-hosted (WebDAV)? Start with one or support several at day 1?
- [ ] **Standing consent default** — should recruiters in a pre-approved list get auto-signed presentations, or require per-request user action? Default stance matters for async UX.

## Privacy

- [ ] **Event payload minimization** — internal events like `credential.issued` must not contain PII. Lint rule or schema validation?
- [ ] **Audit log retention** — how long do we keep who-viewed-what records? Balance: compliance, dispute resolution, data minimization.
- [ ] **Provenance hash granularity** — hash the whole artifact, or hash extracted fields separately so partial disputes are possible?

## Agents (Phase T5 design, flagged now)

- [ ] **Agent runtime** — LLM-backed with structured output, or pure rule/policy engine? Likely hybrid.
- [ ] **Negotiation primitives** — what atomic moves can agents make? (ask for info, offer info, counter, decline, defer to human)
- [ ] **Human-in-the-loop triggers** — when does the agent escalate to its human principal?

## Economy (Phase T7)

- [ ] **Recruiter stake/credit mechanism** — off-chain credit ledger or on-chain token? Start off-chain.
- [ ] **Real-role verification** — what proofs does a recruiter agent present to show a role is real before contacting candidates?

## Future: chain (Phase T8)

- [ ] **Chain choice** — Base (preferred lean), Polygon PoS, or other
- [ ] **ERC standard** — soulbound ERC-1155 (batch efficiency) vs ERC-5192 (official SBT)
- [ ] **Per-user opt-in** for chain anchoring or default-on?
- [ ] **Legal review** of hash-on-chain posture before any deployment

## Career-AI integration (T2 upstream changes)

- [ ] Open branches for the seven upstream changes listed in the plan file (retention, `BADGE_ISSUED` enum, `bound_did`, `credential.issued` event, PRD amendment, ID.me layering, VP in share profile)
