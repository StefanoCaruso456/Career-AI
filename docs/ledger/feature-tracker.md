# Feature Tracker

High-level inventory of what's built, what's queued, what's deferred, and what's explicitly out of scope.

**How to read this**: one line per feature with a status box. Descriptions are one sentence. For detail, follow the link or check the commit referenced.

**How to update**: when a feature ships, check the box and add the commit short-hash. When a new feature is decided, add it to the appropriate section. When something is ruled out, move it to "Out of scope" with a reason.

---

## Shipped

### Protocol specs & schemas

- [x] **Credentials general spec** — normative format, signing, verification, and lifecycle rules for every Career Credential. → [`protocol/spec/credentials.md`](../protocol/spec/credentials.md) (`ceadb6c`)
- [x] **Identity credential spec** — first credential every user gets; proves a DID belongs to a proofed, unique human without exposing PII. → [`protocol/spec/identity.md`](../protocol/spec/identity.md) (`ceadb6c`)
- [x] **Identity credential JSON Schema v1** — draft 2020-12 schema enforcing the spec, with forbidden-field list as PII defense in depth. → [`protocol/packages/badge-schemas/schemas/identity/v1.json`](../protocol/packages/badge-schemas/schemas/identity/v1.json) (`ceadb6c`)
- [x] **Protocol domain layout decision** — single brand domain with purpose-specific subdomains (issuer DID on apex, `schemas.`, `status.`). (`6ce7292`)

### Services

- [x] **api-gateway (BFF)** — the only service Career-AI talks to. Shared-secret auth, Drizzle + Postgres (claims/verifications/audit_events), request correlation IDs, audit log (PII-free), employment-claim orchestrator. → [`services/api-gateway/`](../services/api-gateway) (`22c84b4`, `62cea74`)
- [x] **document-verifier** — pure business logic layer: calls `pdf-extractor`, runs tampering/authenticity/content verifiers, aggregates the verdict. → [`services/document-verifier/`](../services/document-verifier) (`f274d33`, `2de9d70`)
- [x] **pdf-extractor** — reusable PDF parsing service. Extracts text, /Info metadata, XMP, AcroForm fields, signature dictionary summaries, and DocuSign markers. Business-logic-free on purpose — future services (contract-verifier, resume-parser) will reuse it. → [`services/pdf-extractor/`](../services/pdf-extractor) (`2de9d70`)

### Verification pipeline

- [x] **Multi-file upload** — api-gateway accepts `file` + optional `certificate` so candidates can upload the doc and its Certificate of Completion as separate PDFs (DocuSign variant C). (`62cea74`)
- [x] **CoC parser with "Envelope Originator"** — real DocuSign CoCs use "Envelope Originator" as the sender section header, not "Sender". Parser rewritten to match. First real-data VERIFIED verdict on Sunnova Summary.pdf. (`2de9d70`)
- [x] **Envelope-stamp-only detection** — detects DocuSigned documents via the per-page envelope watermark when no CoC is attached. Most common DocuSign variant in the wild. (`07e98ab`)
- [x] **Envelope-ID cross-reference** — when a doc and CoC are both uploaded, verifier confirms they share the same envelope ID. Mismatch flags as structural tampering. (`62cea74`)
- [x] **Structural anomaly detector** — flags PDFs that claim DocuSign provenance via page text but lack signature dict, AcroForm ENVELOPEID_ field, XMP DocuSign namespace, and /Adobe.PPKMS filter. Catches re-save attacks without any crypto work. Confirmed on `fake_unsigned.pdf`. (`62cea74`)
- [x] **Verify-and-forget policy** — artifact policy designed end-to-end (document-verifier is stateless, no persistence, fileHash in provenance only). Still needs enforcement in Career-AI's artifact-domain upstream. (`22c84b4`)

### Cryptographic signature verification

- [x] **@career-ledger/pdf-signature-verifier package** — private library performing real PKCS#7 / CAdES cryptographic validation: find `/Sig` dict → read ByteRange → hash covered bytes → parse CMS SignedData with pkijs → compare digest + verify signature. Confirmed tamper detection on a 1-bit flip. → [`packages/pdf-signature-verifier/`](../packages/pdf-signature-verifier) (`3a872de`)
- [x] **Indefinite-length BER handling** — older PDFKit.NET DMv8/DMv10 DocuSign outputs use indefinite-length BER encoding. Custom walker finds the real end-of-content so asn1js can parse them. Unblocked 12 previously-failing fixtures. (`3a872de`)
- [x] **Crypto-aware verdict aggregation** — `detectTampering` returns `method: pkcs7-verification` with `detected: true/false` based on real cryptographic validity. Verdict floor bumped from SELF_REPORTED to EVIDENCE_SUBMITTED when crypto passes even without a content match. (`3a872de`)

### Content extraction

- [x] **HeuristicContentExtractor** — case-insensitive substring + fuzzy token matching for employer/role/dates. Default extractor. → [`services/document-verifier/src/verifiers/content.ts`](../services/document-verifier/src/verifiers/content.ts) (`f274d33`)
- [x] **ClaudeContentExtractor** — semantic matching via `claude-opus-4-6` + Zod structured outputs. Drop-in replacement via `CONTENT_EXTRACTOR=claude` env var. Gracefully degrades on API failure. → [`services/document-verifier/src/verifiers/content-claude.ts`](../services/document-verifier/src/verifiers/content-claude.ts) (`054969f`)

### Diagnostics & tooling

- [x] **diag-extract / diag-metadata / diag-batch scripts** — single-file text-marker inspection, deep metadata dump, and batch-walk summary tables. Live in `pdf-extractor/scripts/`. (`386ec0b`, `2de9d70`)
- [x] **verify-corpus / tamper-test / dump-cms scripts** — signature verifier observability. Runs across the fixture corpus and confirms tamper detection against mutated inputs. (`3a872de`)
- [x] **46-file PDF fixture corpus** — user-provided DocuSign docs (including matched document+CoC pairs), pyHanko signed corpus (PKCS#7 + PAdES/CAdES), node-signpdf resources. Gitignored; refresh via the corpus memory file.

### Repo structure & operations

- [x] **Three-repo split** — `Career-AI` (frontend, unchanged), `career-ledger` (private backend), `career-protocol` (nested open-source subtree, future split-out). Manifest repo `fsyeddev/capstone` tracks plans and links. (`1898e4a`, initial)
- [x] **Monorepo scaffold** — npm workspaces covering `protocol/packages/*`, `packages/*`, `services/*`. Split-ready: `protocol/` subtree can become `career-protocol` via `git subtree split` with zero refactor. (initial)
- [x] **Postgres + Docker Compose** — api-gateway provides docker-compose.yml on port 5433 (avoids clash with any local 5432). Idempotent DDL migration runner. (`22c84b4`)
- [x] **Signature-free commit policy** — no Claude signature in any git artifact per user preference. (memory rule)

---

## In flight

_(none right now — refactor queue done)_

---

## Roadmap — next up

### Short term (unblock demo polish)

- [ ] **Wire Career-AI to api-gateway via Career ID → Document-backed → Offer letters card** — replace the standalone `/claims/new` route. Form lives inside the Career ID tab, posts to `POST /v1/claims/employment`, renders inline "Saved to your Career ID" / "Couldn't validate" beneath the form. See spec [`002-career-ai-wallet-ui.md`](./planning/specs/002-career-ai-wallet-ui.md).
- [ ] **Add `userNarrative` field to claim payload** — new free-text field in the Offer letters form ("Why this should matter," soul.md style). Threads through `SubmitEmploymentClaimInput` → multipart `claim` JSON → api-gateway → `claims.user_narrative` column → eventually into the issued VC's `credentialSubject.context` or `evidence.userNarrative`.
- [ ] **Distinct error codes** in api-gateway responses — `PASSWORD_REQUIRED`, `NEEDS_OCR`, `INVALID_PDF`, `EXTRACTION_FAILED` so the frontend can display actionable errors instead of generic 400s.
- [ ] **OpenAPI spec export** for api-gateway (zod-openapi) — frontend can generate a typed client.
- [ ] **Structured event emission** — api-gateway emits `claim.submitted`, `verification.completed`, etc. to an internal event bus (implementation under `infra/events`).

### Medium term (protocol core — plan phases T1 and T2)

**Scoping spec:** [`docs/planning/specs/005-compressed-option-a-w3c-vcs.md`](./planning/specs/005-compressed-option-a-w3c-vcs.md) — 3-week compressed path to real W3C VCs end-to-end without KMS/proofing/email, with per-component migration paths to prod. Supersedes spec 001.

- [ ] **identity-service (MVP, no proofing)** — mint `did:web:careera2a.com:u:<hash>` per user, host DID documents, expose signing API. No Persona/ID.me in MVP (additive later). See spec 005 §identity-service.
- [ ] **issuer-service** — sign W3C VC 2.0 credentials (`eddsa-rdfc-2022` DataIntegrityProof, `validFrom`/`validUntil`, BitstringStatusList slot reserved). Uses `@digitalbazaar/vc`. See spec 005 §issuer-service.
- [ ] **wallet-service** — AES-256-GCM encrypt VCs, wallet keys wrapped by env master (KMS later). Build VPs via `@digitalbazaar/vc` signPresentation(). See spec 005 §wallet-service.
- [ ] **Career-AI badge UI + verify button** — populate `careerIdProfile.badges` from wallet-service list; badge click opens VC preview; "Verify" button runs `verifyCredential()` client-side against issuer DID document.
- [ ] **Verify-and-forget upstream in Career-AI** — rewrite `artifact-domain` retention policy to purge bytes on `credential.issued`.
- [ ] **Recruiter-side VC verification** — the demo path where a recruiter receives a signed presentation and verifies it locally.

### Hardening (post-MVP, each additive)

- [ ] **Issuer key → AWS KMS (ECDSA P-256)** — rotate to `ecdsa-rdfc-2022` cryptosuite, add `#key-2` to DID document alongside existing `#key-1`. Existing VCs stay verifiable. See spec 005 §migration A.
- [ ] **Wallet master key → AWS KMS** — rewrap existing `wallet_keys` rows with KMS (1-day data migration). See spec 005 §migration B.
- [ ] **Identity proofing (Persona / Stripe Identity)** — issues separate `IdentityVerifiedCredential` to existing DIDs; employment badges unaffected. See spec 005 §migration C.
- [ ] **BitstringStatusList revocation** — new status-service serving signed status list VCs at `careera2a.com/status/<id>`. See spec 005 §migration D.
- [ ] **Passkey-wrapped wallet keys** — hybrid custody (KMS for async, passkey for user-present). See spec 005 §migration E.
- [ ] **AWS SES email** — needed once identity proofing or revocation notifications go live. See spec 005 §migration F.
- [ ] **SD-JWT-VC selective disclosure** — parallel format to full-VC presentations, enables "share employer + dates but not role". See spec 005 §migration G.
- [ ] **OID4VCI / OID4VP** — external wallet interop (Apple Wallet, Google Wallet, EUDI). See spec 005 §migration H.

### Verification enhancements (open questions in progress)

- [ ] **Document-type classifier (LLM)** — today the gateway does NOT check that an uploaded file is actually an offer letter. Any DocuSign-signed PDF whose employer text matches the claim will pass (e.g. a signed NDA, furniture lease, or solar service agreement all slip through). Need an LLM pass in `pdf-extractor` (or as a pre-check in `document-verifier`) that classifies the extracted text as `offer-letter | contract | agreement | unknown` and rejects non-offer-letters for employment-claim flows. Tracked 2026-04-17 after empirically confirming ATH/DPA/furniture/solar all reach `authenticitySource: docusign` regardless of actual content type.
- [ ] **Soft employer-mismatch handling (LLM)** — current `verdict.ts` hard-fails to `FAILED + SELF_REPORTED` the moment the document's employer text doesn't match the user's typed claim ([verdict.ts:57-58](../services/document-verifier/src/verifiers/verdict.ts#L57-L58)). Creates unnecessary friction: real DocuSign offer letters get rejected when the user types "Google" but the document says "Google Inc." or "Alphabet Inc.". Need a fuzzier comparison — LLM-based canonicalization (employer names), alias lookup ("Google" ⇄ "Alphabet", "Meta" ⇄ "Facebook"), or an LLM judge that decides "close enough" given the full document context. Even simpler stopgap: surface the mismatch to the user in-UI ("Your employer doesn't match the document — did you mean 'Sunnova' instead of 'Acme'?") before hard-failing.
- [ ] **Email DKIM/DMARC verifier** — accept `.eml` uploads, verify DKIM signatures against the employer's published DNS keys. Only real path to a legitimate `SOURCE_CONFIRMED` tier.
- [ ] **Employer verification registry** — operator-maintained registry of employer domains that have proven ownership (DNS TXT or /.well-known file). Trust anchor for any domain-based signal.
- [ ] **DocuSign SBS detection** — when the signer cert Subject matches the claimed employer (DocuSign Standards-Based Signatures, uncommon but valid), upgrade to `SOURCE_CONFIRMED` directly.
- [ ] **OCR fallback** — for scanned / image-only PDFs, return `NEEDS_OCR` with a signal for the frontend or run OCR locally.
- [ ] **ZIP bundle extraction** — handle DocuSign "Download as ZIP" delivery format.
- [ ] **Password-protected PDF handling** — return `PASSWORD_REQUIRED` cleanly instead of crashing the extractor.

### Further out (plan phases T3–T7)

- [ ] **Additional badge types** — Education, Certification, Skill, Endorsement schemas + verifiers (T3).
- [ ] **endorsement-service** — P2P vouching, collusion detection (T3/T6).
- [ ] **sync-service + payroll adapters** — ADP, Argyle, Pinwheel → normalized claims → VC issuance (T4).
- [ ] **candidate-agent-service + employer-agent-service + a2a-gateway** — agent runtimes, DID-authenticated messaging (T5).
- [ ] **Employer Agent A2A attestation** — the path to `MULTI_SOURCE_CONFIRMED`: the employer's own agent confirms envelope origin via a signed attestation.
- [ ] **reputation-engine + matching-engine + collusion-detection** — private moat packages (T6).
- [ ] **negotiation-policy + recruiter stake/credit system** — agent negotiation strategy + spam-prevention economy (T7).

### Deferred / dependent on external decisions

- [ ] **Chain anchoring (Phase T8)** — `CareerBadgeRegistry` smart contract, schema registry, `vcHash` on-chain. Target: Base or Polygon PoS. Hash-only; never PII. Legal review required before any deploy.
- [ ] **AATL trust chain validation** — full cert chain building to Adobe AATL roots + OCSP/CRL revocation. Significant work (~1–2 weeks). Needed for true "who signed this" guarantees, but current demo works without it.
- [ ] **PAdES LTA DSS handling** — multi-signature documents with incremental DSS updates. 2 pyHanko fixtures fail digest check because sig 2 covers incrementally-appended bytes. Known limitation.
- [ ] **CMS encapsulated content** — 1 pyHanko fixture uses `pdf-sig-with-econtent.pdf` format (embedded content rather than detached). Different pkijs call pattern required.
- [ ] **CMS without signed attributes** — `sig-no-signed-attrs.pdf` signs content directly without a `messageDigest` attribute. Our digest check requires the attribute; would need a separate code path.
- [ ] **Consortium commitment for wallet continuity** — public trust commitment that if Career Ledger shuts down, wallet-service code and issuer keys transfer to a non-profit. Design decision for enterprise sales.

---

## Out of scope — will not build

- [ ] **~~DocuSign third-party envelope verification API~~** — structurally impossible. DocuSign does not offer any path (at any price tier, with any partnership) to verify envelopes sent from accounts the platform has no relationship with. Memory: `feedback_docusign_no_third_party_api.md`.
- [ ] **~~PII on any public ledger~~** — hard rule. Not raw, not encrypted, not ever. Regulatory risk (law change) + encryption-break risk. Only cryptographic hashes + non-PII metadata can go on chain, and only in Phase T8. Memory: `feedback_no_pii_on_chain.md`.
- [ ] **~~Encrypted VC on-chain~~** — follows from the PII rule. The user's clearest line in the sand from the design session.
- [ ] **~~DocuSign partnership/marketplace verification integration~~** — requires each employer to individually onboard Career Ledger as a connected app. Does not scale for the "any employer" use case. Ruled out during design.
- [ ] **~~Content-less/commitment-only VC format~~** — Option B from the design session. Broken interoperability story, single point of failure, breaks offline verification. Option A (PII inside encrypted VC, holder-controlled) chosen instead.
- [ ] **~~Claude signature in git artifacts~~** — user preference. No `Co-Authored-By: Claude` in commits, PRs, tags, or any git-tracked artifact. Memory: `feedback_no_claude_signature_in_git.md`.

---

## Open questions

Tracked separately in [`open-questions.md`](./open-questions.md). Highlights:

- DID method finalization (`did:web` for issuer, `did:key` for holders is the current lean)
- Selective disclosure library choice (Spruce vs Veramo vs Microsoft Entra)
- Identity proofing provider (ID.me vs Persona vs Stripe Identity)
- Real domain registration (currently `career-ledger.example` placeholder)
- Backup posture for wallet — hard-require user backup before onboarding or soft-encourage
