# Gateway Demo Punchlist

Tracking what's left on the api-gateway / Career-AI integration before the demo, and the W3C migration after it.

## Must-have before demo

- [x] **Claim-type registry refactor** — extract offer-letter into a handler module behind a registry interface. Enables employment-verification, education, transcript types to slot in additively. _(landed: `src/claim-types/`)_
- [x] **Badge lineage + versioning** — `badges.lineage_key` + `badges.version` columns. Re-verifying the same (employer, role) bumps version within a lineage instead of creating a new badge. Offer-letter and employment-verification share `group: "employment"` so they collapse. _(landed)_
- [x] **`employment-verification` claim type** — HR letters, W-2s, HR portal exports, background-check reports. Shares lineage group with offer-letter (same employer+role collapses into one badge lineage). _(landed: `src/claim-types/employment-verification.ts`, `POST /v1/claims/employment-verification`)_
- [x] **`education` claim type** — diploma / degree certificate. _(landed: `src/claim-types/education.ts`, `POST /v1/claims/education`)_
- [x] **`transcript` claim type** — shallow (content-match only; no deep structural detection). _(landed: `src/claim-types/transcript.ts`, `POST /v1/claims/transcript`)_
- [ ] **Career-AI: forms for the three new types + POST to their `/v1/claims/<kind>` routes**.
- [ ] **Career-AI UI: read-back integration** — call `GET /v1/claims` on profile load and render verified badges from the gateway instead of local-only state. This is what makes the "log in → see your badges" story work.
- [x] **Body-size limit** on `POST /v1/claims/employment` — add Hono `bodyLimit` middleware (~10MB) so a large PDF can't OOM the gateway. _(10MB cap scoped to /v1/claims/*)_
- [x] **Redact `onError` response in production** — currently leaks `error.toString()` outside `NODE_ENV=production`. Return a generic message + correlation ID; keep the stack in server logs only.
- [ ] **Map `VerificationError` to proper HTTP codes**:
  - `EXTRACTION_UNAVAILABLE` → 502
  - `INVALID_REQUEST` → 400
  - everything else → 500

## Hardening (nice-to-have)

- [x] **Audit schema types** — `status_code` and `duration_ms` are `text`; should be `integer`. Cheap migration. _(landed in hardening branch)_
- [x] **Audit middleware: drop logging** — when the fire-and-forget insert fails the event silently disappears. Emit a structured `audit_drop` log line with the same fields. _(done — JSON line with full fields on DB failure)_
- [ ] **Rate limit per actor DID** — simple token bucket, e.g. 30 verifications/hour.
- [ ] **Vitest truth table** for `verifier/verifiers/verdict.ts` — the long comment block is already a spec; codify the (tampering, authenticity, content) → (verdict, tier) matrix.
- [x] **Cleanup**: dead `void actorDid` line in `audit.ts`. _(landed in hardening branch)_
- [x] **`VerificationError` → HTTP codes** — orchestrator was collapsing `EXTRACTION_UNAVAILABLE` and `INVALID_REQUEST` to 500. Route now maps to 502 and 400. _(landed in hardening branch)_

## W3C migration (after demo stabilizes)

- [ ] **Pick signing lib** — `jose` for JWT-VC, or `@digitalcredentials/*` for JSON-LD Data Integrity proofs. JWT-VC is simpler for a first cut.
- [ ] **Issuer keypair** — generate, publish `did.json` at the `ISSUER_DID` host (did:web resolves via HTTPS).
- [ ] **Swap badge payload kind** — flip `badges.payload.kind` from `"bare-employment"` to `"vc-employment"`; store the signed VC in the same column. No schema change, no ID change, public read path unchanged.
- [ ] **`GET /v1/badges/:id`** — returns the raw VC JSON for external verifiers. Decide: authenticated or capability-style (unauthenticated but unguessable UUID).
- [ ] **`credentialUrl` in POST `/v1/claims/employment` response** — when verdict is `VERIFIED`, return a stable URL pointing at `/v1/badges/:id` so the UI can link to the credential without having to reconstruct the URL.
- [ ] **`GET /v1/wallet`** — authenticated endpoint scoped to `ownerDid` that returns all non-revoked badges for the caller. Sister endpoint to the capability-style `GET /v1/badges/:id`.
- [ ] **Keep `confidenceTier` OUT of the VC payload** — tier is gateway-policy (how much we trust the signals), not a claim the subject is asserting. VC should carry only ground-truth fields: employer, role, dates, verifiedAt, verifier DID.
- [ ] **Revocation** — `revokedAt` nullable column already exists; add a StatusList2021 credential and expose its endpoint.

## Open decisions

- [ ] Do recruiters view badges via a **public URL**, or only through the authenticated Career-AI profile? Drives whether `GET /v1/badges/:id` is unauthenticated.
- [ ] **One badge per VERIFIED claim**, or collapse re-verifies of the "same" role into one durable badge? Current code issues one per claim row, and each re-upload creates a new claim.

## Done (reference)

Merged in PR #432 (`d40f441`):
- Per-user actor DID via `X-Actor-Did` header + timing-safe secret compare + fail-fast on missing secret.
- `GET /v1/claims` and `GET /v1/claims/:id`, scoped to the authenticated actor.
- `badges` table + badge issuance on VERIFIED; `badgeId` in submit response and read records.
- Verifier-error verifications row so `claim.status` always derives from a row (design rule #7).
- Career-AI side: `buildActorDid()` produces a DID-core–conformant `did:web:career-ai:users:<urlencoded-email>` instead of the old `#email` fragment form.
