# 002-career-ai-wallet-ui

**Status**: Draft (revised 2026-04-16 — see "Flow update" below)
**Owner**: fsyed
**Related**: depends on [`001-issuer-wallet-mvp.md`](./001-issuer-wallet-mvp.md). Delivers demo priority items 1 (frontend), 3 (frontend), and 4 (frontend).

## Flow update (2026-04-16) — supersedes the original /wallet + /claims/new design below

After Stefano's 164-commit batch added a `/wallet` placeholder route and heavily iterated on the **Career ID** tab (including the trust modal and Career ID badges rail), the credential UX is being consolidated into the Career ID tab. The standalone `/wallet` and `/claims/new` routes from the original design are dropped.

**New surface:** the Career ID tab already exists and contains a section called **"Document-backed"** (named after the W3C VC term for credentials backed by a source document). That section gets an **"Offer letters" card** — clicking it opens a form for uploading + validating an offer letter.

**New form fields:**
1. **Issuer** — employer name / org
2. **Issued date** — date the document was issued
3. **Validation context** — what should be matched against the document (the structured claim that drives extraction matching)
4. **Why this should matter** — free-text, soul.md style. The user's narrative about why this credential matters to them. New field, not in the original spec.
5. **Final attachment** — the document upload (single file; CoC handling deferred to a disclosure)

**Save behavior:** triggers the existing validation pipeline (`POST /v1/claims/employment` on api-gateway). Result is rendered inline beneath the form:
- ✅ Validated → "Saved to your Career ID."
- ❌ Failed → "Couldn't validate" (exact copy TBD)

No navigation away from the Career ID tab; no separate `/wallet?newBadge=…` redirect; no preview modal redesign needed yet (badges already render in Stefano's Career ID badges rail — wire in the new badge to that rail on success).

**Backend impact:**
- `userNarrative` (or `personalContext`) added to `SubmitEmploymentClaimInput` schema
- Same field added as a nullable `user_narrative` column on the `claims` table in api-gateway
- Field is optional and not used by validation logic (extraction/matching still runs on `validation context`); it's persisted with the claim and threaded into the VC's `credentialSubject.context` or `evidence.userNarrative` field at issuance time (T2)

**Sections of the original spec that remain valid:**
- Topology (Browser → Next.js API routes → api-gateway → downstream)
- Session → DID binding (provisioning `bound_did` on first login)
- API client `lib/ledger/client.ts` shape — function signatures unchanged
- Proxy route auth pattern (`X-Owner-Did` header server-side)
- Artifact handling pattern (Career-AI uploads → `artifactId` → proxy forwards bytes)
- Migration / rollout (env vars, DB column on TalentIdentity)

**Sections superseded:**
- "New route: `/wallet`" → instead, integrate into existing Career ID tab badges rail
- "New route: `/claims/new`" → replaced by Offer letters card form inside Career ID > Document-backed
- Form field list → see new fields above (adds `userNarrative`, drops `endDate` for now since offer letters typically don't have one at issuance time)

The remainder of this document is the original draft, kept for context. Treat the Flow update section as authoritative.

---

## Problem

The career-ledger backend verifies documents, issues W3C VCs, and stores them in an encrypted wallet — but none of it is visible to a user yet. Career-AI has the API routes and the data model for claims and artifacts ([`packages/contracts/src/claim.ts`](../../../../Career-AI/packages/contracts/src/claim.ts)) but no frontend for claim submission and no wallet surface at all. For the streamed demo, the user needs a clickable end-to-end flow: log in → upload a document → see a VERIFIED status → open a wallet → see the badge they just earned → click it to preview the credential contents. This spec covers the Career-AI work to make that happen.

## Scope

**In**
- New `/wallet` route in the Career-AI App Router with a badge list + click-to-preview modal
- New `/claims/new` route (or in-place flow on an existing page) with a claim form + `FileUploadDropzone` for the document and an optional second dropzone for a Certificate of Completion
- Next.js API route `POST /api/v1/ledger/claims/employment` that proxies to the career-ledger gateway (`POST /v1/claims/employment`) — the shared secret never leaves the server
- Next.js API routes `GET /api/v1/wallet/credentials` and `POST /api/v1/wallet/credentials/[id]/decrypt` that proxy to `wallet-service` via the gateway
- `bound_did` added to `TalentIdentity` — the DID the user's wallet belongs to. Provisioned on first login via a one-shot call to the gateway's new `POST /v1/accounts` endpoint.
- Typed client wrapper `lib/ledger/client.ts` following the existing fetch-plus-Zod pattern (the same shape as [`lib/employer/load-candidate-matches.ts`](../../../../Career-AI/lib/employer/load-candidate-matches.ts))
- A single shared Zod schema for the gateway's `PublicClaimVerificationResponse` and for the wallet list / preview payloads — colocated in `packages/contracts/src/ledger.ts`
- One new env var `CAREER_LEDGER_GATEWAY_URL` + one new secret `CAREER_LEDGER_GATEWAY_SECRET`, read via the existing `readFirstEnv()` helper in [`auth-config.ts`](../../../../Career-AI/auth-config.ts)
- Enough component styling (CSS Modules, matching the existing dark-theme design system) to not look like a prototype on a live stream

**Out**
- Admin review UI — the gateway's verdict is returned directly, demo doesn't route through a human reviewer
- Recruiter share / Verifiable Presentation flow — deferred to its own spec
- Real WebAuthn passkey challenge for decrypt — the demo uses the session-derived KEK stub from `001`
- Wallet backup / disaster recovery UI
- Badge filtering, search, sort — demo has one or two badges per user
- Error telemetry and retry UX beyond "show the error, let the user retry"
- Non-employment badge types in the wallet UI — employment only for the demo
- Admin impersonation / multi-user dev mode

## Design

### Topology

```
Browser (Career-AI pages)
    │
    ▼
Next.js API routes (Career-AI, server-side, hold the shared secret)
    │  POST /api/v1/ledger/claims/employment
    │  GET  /api/v1/wallet/credentials
    │  POST /api/v1/wallet/credentials/:id/decrypt
    ▼
career-ledger api-gateway (:8080)
    │  shared-secret auth + orchestrator
    ├─► document-verifier ─► pdf-extractor
    ├─► issuer-service
    └─► wallet-service (new in 001)
```

Why proxy through Next.js API routes instead of browser → gateway direct: the gateway uses a single shared secret. Exposing that to the browser is a non-starter. The proxy pattern also gives us a natural place to enrich the request with the authenticated user's `bound_did` from the NextAuth session, so the frontend never has to handle DIDs directly.

### Session → DID binding

Career-AI's session already carries `appUserId`, `talentIdentityId`, etc. (see [`auth.ts`](../../../../Career-AI/auth.ts) lines 77–87). We add one more field: `boundDid`.

On first login after this spec ships:
1. `ensurePersistentCareerIdentityForSessionUser()` notices `TalentIdentity.bound_did` is null.
2. It calls `POST /v1/accounts` on the gateway with an internal idempotency key equal to `appUserId`.
3. Gateway generates a fresh `did:key`, creates a wallet in `wallet-service`, returns `{ ownerDid }`.
4. Career-AI stores `bound_did = ownerDid` on the `TalentIdentity` row.
5. The DID flows into the JWT on subsequent session refreshes.

Every subsequent ledger call uses `session.boundDid` server-side; the frontend never sees it.

### New route: `/wallet`

One page, two main elements:

1. **Badge grid** — cards rendered from `GET /api/v1/wallet/credentials`. Each card shows badge type icon, employer name (pulled from a non-sensitive summary on the list response, not from decrypted contents), confidence tier chip (`REVIEWED` / `SOURCE_CONFIRMED` / etc.), issued date, status dot.
2. **Preview modal** — clicking a card opens a modal (reuse the `createPortal` pattern from [`employer-candidate-detail-modal.tsx`](../../../../Career-AI/components/employer/employer-candidate-detail-modal.tsx)). Modal calls the decrypt endpoint on open, shows the plaintext VC's `credentialSubject` + `issuer` + `validFrom` + the `proof.proofValue` with a copy button + a "Verify this badge" link (for the demo, this opens a `/verify/[credentialId]` route that re-runs signature + schema checks server-side and shows a green checkmark).

Empty state: "No badges yet. Upload a document to earn your first badge → [link to /claims/new]".

### New route: `/claims/new`

Single-column form:

1. Employer name (text input)
2. Role (text input)
3. Start date (date picker)
4. End date (date picker, optional)
5. Document (`FileUploadDropzone` — reuse [`components/file-upload-dropzone.tsx`](../../../../Career-AI/components/file-upload-dropzone.tsx))
6. Certificate of Completion (optional second dropzone, same component)
7. Submit

On submit: `POST /api/v1/ledger/claims/employment`. On success, redirect to `/wallet?newBadge=<credentialId>` so the wallet page can highlight the freshly-minted badge. On failure, show the gateway's error message inline.

### API client

New file `lib/ledger/client.ts`:

```ts
export async function submitEmploymentClaim(
  input: SubmitEmploymentClaimInput,
): Promise<PublicClaimVerificationResponse>;

export async function listWalletCredentials(
  ownerDid: string,
): Promise<WalletCredentialSummary[]>;

export async function decryptCredential(
  ownerDid: string,
  credentialId: string,
): Promise<DecryptedCredentialPayload>;
```

Each one follows the fetch + Zod pattern from [`lib/jobs/load-job-listings.ts`](../../../../Career-AI/lib/jobs/load-job-listings.ts). All three are server-only (`import "server-only"`) so the shared secret never ends up in a client bundle.

## Data model / API

### New field on `TalentIdentity`

```sql
ALTER TABLE talent_identity
  ADD COLUMN bound_did TEXT NULL;

CREATE UNIQUE INDEX idx_talent_identity_bound_did
  ON talent_identity(bound_did)
  WHERE bound_did IS NOT NULL;
```

Nullable until the first post-deploy login provisions it. Unique so the DID ↔ user binding is 1:1.

### New contract types (in `packages/contracts/src/ledger.ts`)

```ts
export const SubmitEmploymentClaimInput = z.object({
  employer: z.string().min(1),               // "Issuer" in the Career ID form
  role: z.string().min(1),
  startDate: z.string(), // ISO              // "Issued date"
  endDate: z.string().nullable(),
  validationContext: z.string().nullable(),  // free-text, what should match against the doc
  userNarrative: z.string().nullable(),      // "Why this should matter" (soul.md style) — persisted, not used by validation
  documentArtifactId: z.string().uuid(),     // "Final attachment"
  certificateArtifactId: z.string().uuid().nullable(),
});

export const PublicClaimVerificationResponse = z.object({
  claimId: z.string().uuid(),
  status: z.enum(["VERIFIED", "REVIEWED", "FAILED"]),
  confidenceTier: z.enum([
    "SELF_REPORTED", "EVIDENCE_SUBMITTED", "REVIEWED",
    "SOURCE_CONFIRMED", "MULTI_SOURCE_CONFIRMED",
  ]),
  credentialId: z.string().uuid().nullable(),
  vcHash: z.string().nullable(),
  displayStatus: z.string(),
  matches: z.object({ /* ... */ }),
  authenticitySource: z.string().nullable(),
  verifiedAt: z.string(),
});

export const WalletCredentialSummary = z.object({
  credentialId: z.string().uuid(),
  credentialType: z.string(),
  issuer: z.string(),
  issuedAt: z.string(),
  status: z.enum(["active", "revoked", "suspended"]),
  summary: z.object({
    employer: z.string(),
    role: z.string(),
    confidenceTier: z.string(),
  }),
});

export const DecryptedCredentialPayload = z.object({
  credentialId: z.string().uuid(),
  vcPayload: z.unknown(), // full signed VC JSON-LD — preview only, not persisted
});
```

### Proxy route behaviors

- `POST /api/v1/ledger/claims/employment` — auth via `getServerSession()` → lookup `bound_did` → forward the multipart upload to gateway `POST /v1/claims/employment` with `Authorization: Bearer ${CAREER_LEDGER_GATEWAY_SECRET}` and a new header `X-Owner-Did: ${boundDid}`. (Gateway work: accept and honor this header when present, ignore when absent for backwards compat with the existing smoke test.)
- `GET /api/v1/wallet/credentials` — auth → forward to gateway `GET /v1/wallets/:boundDid/credentials`
- `POST /api/v1/wallet/credentials/[id]/decrypt` — auth → forward to gateway `POST /v1/wallets/:boundDid/credentials/:id/decrypt`

All three refuse if `boundDid` is missing (returns a clear error that the UI can show: "wallet not yet provisioned, please refresh").

### Artifact handling

Career-AI already has [`/api/v1/artifacts/upload`](../../../../Career-AI/app/api/v1/artifacts/upload/route.ts) — files land in the existing artifact store and return an `artifactId`. The flow for demo is:

1. Frontend uploads the raw PDF to `/api/v1/artifacts/upload` → gets `artifactId`
2. Frontend submits the claim form with `documentArtifactId`
3. Proxy route looks up the artifact bytes, forwards them in the multipart request to the gateway

This keeps the demo consistent with Career-AI's existing upload surface and the server-side proxy is the only place that holds both halves of the state at once.

## Test plan

Manual demo rehearsal (this is also the stream script):

1. **Sign in** as a fresh Google account → observe the new `bound_did` getting provisioned on first login (check `TalentIdentity` row in the DB).
2. **Navigate to `/wallet`** → empty-state card says "No badges yet".
3. **Click "Upload a document"** → `/claims/new` loads.
4. **Fill the form** with claim matching `signed.pdf` (Acme Corp / Senior Engineer / 2022-03-01).
5. **Upload `signed.pdf`**. Submit.
6. **Gateway returns `VERIFIED` / `REVIEWED`** in ~2 seconds. Redirect to `/wallet?newBadge=<id>`.
7. **Wallet page shows one badge card**. The new-badge URL parameter highlights it with a brief animation.
8. **Click the badge**. Modal opens, decrypt endpoint runs, preview shows employer + role + dates + `proof.proofValue` (truncated with copy button).
9. **Click "Verify this badge"**. `/verify/[id]` server-side re-runs the signature check, shows a green "Valid signature from did:web:..." line.
10. **Tamper path (off-camera rehearsal)**: flip a bit in `signed.pdf`, re-submit → gateway returns `FAILED` → form shows a red error → wallet is unchanged.

Automated (vitest, stretch):
- Unit: `submitEmploymentClaim()` sends the correct multipart payload shape
- Unit: Zod schemas round-trip against fixture responses from the gateway
- Integration: mock the gateway, hit the three proxy routes, assert auth header + `X-Owner-Did` propagation

## Open questions

1. **Where does `/claims/new` live in navigation?** A new top-level nav item, a button on `/wallet`, or both? Lean: put the button on `/wallet` empty state and skip a nav entry for the demo — keeps the surface small.
2. **Does the streamed demo log in with a real Google account live on camera?** If yes, we need a test Google account pre-provisioned and the audience sees its name — plan for a scrubbed display name. If no, we use a pre-authed session and skip the sign-in step.
3. **Should the wallet page be the new default landing page after sign-in?** Product-wise it's the "this is the value" surface. But changing the post-auth redirect is risky on top of everything else. Lean: leave the existing landing page, add a visible nav link to `/wallet`.
4. **Certificate of Completion upload — first-class or hidden behind "advanced"?** Uploading two files in a live demo risks fumbling. Lean: hide the second dropzone behind a "Have a Certificate of Completion?" disclosure by default, but test the path on rehearsals.
5. **Error messages on stream**: gateway errors can be technical (`SCHEMA_VALIDATION_FAILED`, etc.). Should the proxy route map them to friendly strings? Lean: yes, maintain a small translation map in `lib/ledger/errors.ts`, default to "Something went wrong, please try again" if unmapped.
6. **What happens if `wallet-service` is down during a demo?** The list endpoint should return `503` fast and the page should show a clear error rather than spin forever. Lean: strict timeout on the proxy (2s), pre-warm all services before stream start.

## Migration / rollout

- New DB column on `TalentIdentity` (`bound_did TEXT NULL`) — existing users get `NULL` and are provisioned on next login. No backfill script needed pre-demo since all stream accounts are fresh.
- New env vars:
  - `CAREER_LEDGER_GATEWAY_URL` (e.g. `http://localhost:8080` dev, real URL for stream)
  - `CAREER_LEDGER_GATEWAY_SECRET` (matches the `SHARED_SECRET` in api-gateway)
- One new dependency on `@career-protocol/badge-schemas` (or equivalent workspace import) for the `EmploymentCredential` type — this may be the first time Career-AI pulls from the career-ledger workspace. If resolving across repos is painful, copy the minimal type shape into `packages/contracts/src/ledger.ts` and accept the duplication until the two repos merge.
- Gateway changes required (tracked in a follow-up ticket, not in this spec):
  - `POST /v1/accounts` — creates a DID + wallet, idempotent on an external key
  - Accept `X-Owner-Did` header on `POST /v1/claims/employment` and forward it to `wallet-service` so the resulting VC lands in the right wallet
  - `GET /v1/wallets/:ownerDid/credentials` and the decrypt endpoint — direct passthroughs to `wallet-service` behind the same shared-secret auth
- Demo-only shortcuts are labeled with `// DEMO STUB:` in code so post-demo hardening has a grep target (mirrors the convention set in spec `001`).
