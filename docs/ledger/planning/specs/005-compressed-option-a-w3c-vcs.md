# 005 — Compressed Option A: W3C VCs end-to-end, fastest real path

**Status**: Planning — not started
**Owner**: fsyed
**Last updated**: 2026-04-18
**Supersedes**: 001 (issuer-wallet-mvp) — same direction, tightened scope

## TL;DR

Ship real, externally-verifiable W3C Verifiable Credentials end-to-end in ~3 weeks of solo dev work, without KMS, identity proofing, or email. Every deferred piece is **additive** — adding it later does not require re-issuing badges or migrating VC data.

Demo we can show at the end: user uploads an offer letter in Career ID → a badge appears → clicking the badge shows the full signed VC JSON → a "Verify" button re-runs the cryptographic signature check against the issuer's public DID document, green checkmark. No trust in our server required for verification.

## Scope

**In (real, not stubbed):**
- Ed25519 signing keys (env var for MVP, rotated to AWS KMS later as one-time event)
- `did:web` DIDs for issuer + every user, DID documents hosted on careera2a.com
- W3C VC Data Model 2.0 compliant credentials (`@context: https://www.w3.org/ns/credentials/v2`, `validFrom`/`validUntil`, BitstringStatusList slot reserved but not populated yet)
- DataIntegrityProof with `eddsa-rdfc-2022` cryptosuite
- JSON Schema for EmploymentCredential, hosted at a stable URL
- VC ciphertext storage (AES-256-GCM, wrapping key in env var for MVP)
- vcHash computed and persisted at issuance (T8 chain anchoring stays additive)
- Career-AI wallet UI surface (badge card, VC preview, verify button, Verifiable Presentation generation stub)

**Out (deferred, migration path spec'd below):**
- AWS KMS for signing keys
- AWS KMS for wallet key wrapping
- Persona / Stripe Identity identity proofing (→ adds `IdentityVerifiedCredential` later; existing employment badges stay valid)
- AWS SES / Resend email provider
- Passkey-wrapped wallet keys (WebAuthn) — MVP uses server-side AES key
- BitstringStatusList revocation populated (slot reserved in VCs, status server comes later)
- SD-JWT-VC selective disclosure — MVP does full-VC presentations only
- OID4VCI / OID4VP wallet compatibility (wallet-service is bespoke for MVP)
- AATL trust chain integration on document-verifier side (already deferred in feature-tracker)

**Non-goals:**
- Real per-user HSM-wrapped keys
- Multi-issuer support (Career-AI is the only issuer in MVP)
- Schema versioning / credential migration (v1 only)
- Chain anchoring (Phase T8, unchanged)

## Architecture (MVP)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Railway project: CareerA2A                  │
│                                                                  │
│  Postgres (single instance, separate DBs for ledger + services) │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   api-       │  │  pdf-        │  │ document-    │          │
│  │   gateway    │  │  extractor   │  │ verifier     │          │
│  │   :8080 pub  │  │  :8788       │  │  :8787       │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                        │
│    ┌────┴─────┬──────────────┬──────────────┐                  │
│    ▼          ▼              ▼              ▼                   │
│  ┌──────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐               │
│  │ ident│  │  issuer │  │  wallet │  │ (future │               │
│  │ :8081│  │  :8082  │  │  :8083  │  │  status)│               │
│  │  pub │  │  priv   │  │  priv   │  │  :8084  │               │
│  └──────┘  └─────────┘  └─────────┘  └─────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

          Career-AI (existing Railway project)
                    │
                    ▼  HTTPS
          api.careera2a.com (api-gateway public URL)

          Public careera2a.com paths (static or served by identity/status):
          ├── /.well-known/did.json        ← issuer DID document
          ├── /u/<hash>/did.json           ← per-user DID documents
          ├── /schemas/employment/v1       ← JSON Schema (static)
          ├── /contexts/employment/v1      ← JSON-LD context (static)
          └── /status/<listId>             ← (future) BitstringStatusList VC
```

### Data flow — happy path

```
1. User uploads offer letter in Career ID > Document-backed > Offer letters
2. Career-AI persists evidence + artifact (existing flow)
3. Career-AI calls api-gateway /v1/claims/employment (existing flow)
4. api-gateway orchestrator:
   a. INSERT claim (existing)
   b. Call document-verifier → get verdict
   c. INSERT verification (existing)
   d. IF verdict confidenceTier > SELF_REPORTED:
      i.  GET identity-service for subject DID (mint if first time)
      ii. POST issuer-service /v1/credentials/issue with claim + subject DID
      iii. issuer-service:
           - Build VC payload (W3C 2.0 shape)
           - Sign with eddsa-rdfc-2022
           - Compute vcHash
           - Return signed VC + vcHash
      iv. POST wallet-service /v1/wallets/{did}/credentials
           - Encrypt VC (AES-256-GCM)
           - Store ciphertext, status, vcHash
      v.  Return credential summary to Career-AI
5. Career-AI persists badge reference on the evidence row
6. Career-AI fetches badge list from wallet-service (via api-gateway proxy)
7. Career ID UI renders badge; clicking decrypts + shows full VC; "Verify" button re-runs proof check
```

## Key decisions (locked, rationale)

| Decision | Choice | Why |
|---|---|---|
| VC Data Model | 2.0 | Current W3C Recommendation; v1.1 is legacy. New implementations target v2 directly. |
| Canonical context | `https://www.w3.org/ns/credentials/v2` | Required by data model 2.0. |
| Date fields | `validFrom` / `validUntil` | v2 renames from `issuanceDate` / `expirationDate`. |
| Proof format | `DataIntegrityProof` with `eddsa-rdfc-2022` | W3C-blessed default for v2. RDF Dataset Canonicalization > JCS for interop. |
| DID method | `did:web` | HTTPS-resolvable, works without chain dependencies, all major verifier libs support it. |
| DID scope | One DID per user (stable from signup) + one issuer DID | Stable DIDs avoid reissuance problems. Identity proofing later attaches a separate credential. |
| Signing algorithm | Ed25519 (env var) for MVP → ECDSA P-256 (KMS) for prod | AWS KMS doesn't support Ed25519; key rotation event when we go to KMS. Existing VCs stay valid via the issuer's DID document exposing both keys during transition. |
| Storage | AES-256-GCM per-user key, wrapped by a single env-var master key | Adding KMS wrap + passkey wrap later is additive (rewrap existing records). |
| Revocation | Slot reserved via `credentialStatus` field, but no status list populated in MVP | BitstringStatusList comes later; MVP credentials are non-revocable (acceptable for demo). |
| Library | `@digitalbazaar/vc` ecosystem | Canonical W3C VC library for Node. Alternatives (Veramo, Spruce) are heavier or have pivoted. |
| DID documents | Self-hosted as static JSON via issuer-service | `@digitalbazaar/did-method-web` on the resolver side; no library needed on the issuer side (it's just serving JSON). |

### Staleness caveat

Research done 2026-04-18 flagged that some library versions, AWS pricing, and Persona pricing may have moved since the cutoff. Verify on npm + AWS pricing page + vendor sites before locking deps.

## External infrastructure setup (before code)

### 1. DNS (30 min)

Add subpath routing on `careera2a.com`. All of these point at the identity-service's Railway public URL:

```
careera2a.com/.well-known/did.json     → issuer-service
careera2a.com/u/*                      → identity-service
careera2a.com/schemas/*                → identity-service (or Cloudflare Worker)
careera2a.com/contexts/*               → identity-service (or Cloudflare Worker)
careera2a.com/status/*                 → (future) status-service
```

Simplest approach: one service serves all of these paths. When status-service comes online, route `/status/*` elsewhere.

**Gotcha**: `did:web:careera2a.com` resolves to `https://careera2a.com/.well-known/did.json`. `did:web:careera2a.com:u:abc123` resolves to `https://careera2a.com/u/abc123/did.json` (colons in the DID become slashes in the URL, per spec).

### 2. Railway services (1 hour)

Add to existing `CareerA2A` project:
- identity-service (new, public)
- issuer-service (new, private)
- wallet-service (new, private)

Wire env vars:
- All three get `DATABASE_URL=${{Postgres.DATABASE_URL}}/career_ledger` (shared Postgres instance, one DB)
- api-gateway adds `IDENTITY_SERVICE_URL`, `ISSUER_SERVICE_URL`, `WALLET_SERVICE_URL` pointing at `RAILWAY_PRIVATE_DOMAIN` refs
- issuer-service and wallet-service get `IDENTITY_SERVICE_URL` for DID lookups

### 3. Generate issuer keypair (5 min, one-time)

```bash
# Locally on your laptop:
node -e "
const { randomBytes } = require('crypto');
const ed = require('@noble/ed25519');
const priv = ed.utils.randomPrivateKey();
const pub = ed.getPublicKey(priv);
console.log('ISSUER_ED25519_PRIVATE_KEY_HEX=' + Buffer.from(priv).toString('hex'));
console.log('ISSUER_ED25519_PUBLIC_KEY_HEX=' + Buffer.from(pub).toString('hex'));
"
```

Store the private key in Railway as `ISSUER_ED25519_PRIVATE_KEY_HEX` (environment variable, encrypted at rest by Railway). Public key embedded in issuer DID document. Flag with `// DEMO STUB — migrate to AWS KMS` in code.

### 4. Generate wallet master key (5 min, one-time)

```bash
node -e "console.log('WALLET_MASTER_KEY_HEX=' + require('crypto').randomBytes(32).toString('hex'))"
```

Set as `WALLET_MASTER_KEY_HEX` on wallet-service. Used to wrap per-user AES keys.

## Service specs

### identity-service

**Purpose**: mint DIDs for users + host DID documents. No identity proofing in MVP.

**Port**: 8081 (public — DID documents must be externally resolvable)

**Schema** (one DB shared with issuer/wallet):

```sql
CREATE TABLE user_dids (
  user_id text PRIMARY KEY,                -- Career-AI's talent_identity_id
  did text NOT NULL UNIQUE,                -- e.g. did:web:careera2a.com:u:3a8f...
  public_key_multibase text NOT NULL,      -- z6Mk... Ed25519 public key (multibase z-base58)
  private_key_ref text NOT NULL,           -- "env:ISSUER_ED25519_PRIVATE_KEY_HEX" for MVP
                                           -- future: "kms:arn:aws:kms:..."
  did_document jsonb NOT NULL,             -- cached full DID document
  created_at timestamptz NOT NULL DEFAULT NOW(),
  rotated_at timestamptz                   -- NULL until first rotation
);

CREATE TABLE issuer_keys (
  id text PRIMARY KEY DEFAULT 'default',   -- singleton until we need multi-key
  public_key_multibase text NOT NULL,
  private_key_ref text NOT NULL,
  algorithm text NOT NULL DEFAULT 'Ed25519',  -- future: 'ECDSA-P256' post-KMS
  created_at timestamptz NOT NULL DEFAULT NOW(),
  retired_at timestamptz
);
```

**HTTP endpoints**:

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/.well-known/did.json` | Issuer DID document | Public |
| GET | `/u/:userIdHash/did.json` | User DID document | Public |
| POST | `/v1/dids` | Mint DID for a user (idempotent on `userId`) | Shared secret (internal) |
| GET | `/v1/dids/by-user/:userId` | Lookup DID for Career-AI user | Shared secret |
| GET | `/v1/dids/:did/resolve` | Resolve a DID to its document (internal convenience) | Shared secret |
| POST | `/v1/dids/:did/sign` | Sign payload with user's DID key | Shared secret (wallet-service uses this for VP generation) |

**DID document shape** (what's served at `/.well-known/did.json` for issuer):
```json
{
  "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/data-integrity/v2"
  ],
  "id": "did:web:careera2a.com",
  "verificationMethod": [{
    "id": "did:web:careera2a.com#key-1",
    "type": "Multikey",
    "controller": "did:web:careera2a.com",
    "publicKeyMultibase": "z6Mk..."
  }],
  "assertionMethod": ["did:web:careera2a.com#key-1"],
  "authentication": ["did:web:careera2a.com#key-1"]
}
```

User DID documents follow the same shape with `did:web:careera2a.com:u:<hash>` as the id.

**Libraries**:
- `@noble/ed25519` — keypair generation, signing
- `multiformats` — multibase encoding (z6Mk... format)
- `hono` + `@hono/node-server` — HTTP server
- Native Node `crypto` for SHA-256 (for userId hashing)

**Files**:
```
services/identity-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Hono app, route wiring
│   ├── env.ts                   # env var loading + validation
│   ├── db.ts                    # Postgres pool
│   ├── routes/
│   │   ├── did-document.ts      # GET /.well-known/did.json, GET /u/:hash/did.json
│   │   ├── dids.ts              # POST /v1/dids, GET /v1/dids/by-user/:userId
│   │   └── sign.ts              # POST /v1/dids/:did/sign
│   ├── did/
│   │   ├── generate.ts          # mint keypair + build DID + document
│   │   ├── resolve.ts           # DB lookup + cache
│   │   └── multibase.ts         # z6Mk encoding helpers
│   └── keys/
│       └── provider.ts          # abstract: envProvider (MVP) | kmsProvider (future)
```

**Effort**: 3-4 days

---

### issuer-service

**Purpose**: sign W3C VCs. Called by api-gateway after verification succeeds.

**Port**: 8082 (private)

**Schema**:
```sql
CREATE TABLE issuance_log (
  id text PRIMARY KEY,                     -- "urn:uuid:..."
  credential_id text NOT NULL UNIQUE,      -- same as id
  issuer_did text NOT NULL,
  subject_did text NOT NULL,
  credential_type text NOT NULL,           -- "EmploymentCredential"
  schema_id text NOT NULL,                 -- URL of the schema used
  vc_hash text NOT NULL,                   -- sha256(canonicalize(signed_vc)) for T8
  issued_at timestamptz NOT NULL,
  evidence_ref jsonb,                      -- { artifactHash, claimId, verificationId }
  status_list_id text,                     -- NULL in MVP (no revocation)
  status_list_index integer
);

CREATE INDEX issuance_log_subject_idx ON issuance_log(subject_did);
```

**HTTP endpoints**:

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/credentials/issue` | Issue a VC given a claim + subject DID |
| POST | `/v1/credentials/:id/revoke` | (Stub) mark revoked in issuance_log (no status list yet) |

**Request shape**:
```ts
POST /v1/credentials/issue
{
  subjectDid: "did:web:careera2a.com:u:abc123",
  credentialType: "EmploymentCredential",
  claim: {
    employer: { name: "Sunnova", did: null },
    role: "Customer",
    employmentPeriod: { startDate: "2024-11-29", endDate: null },
    confidenceTier: "REVIEWED"
  },
  evidence: {
    artifactHash: "sha256:3a8f...",
    claimId: "uuid",
    verificationId: "uuid",
    verificationMethod: "INTERNAL_REVIEW"
  }
}
```

**Response** — the signed VC + metadata:
```ts
{
  credentialId: "urn:uuid:9f3c...",
  vcHash: "sha256:...",
  signedVc: { /* full W3C VC JSON-LD */ }
}
```

**Libraries**:
- `@digitalbazaar/vc` — issuance API
- `@digitalbazaar/data-integrity` — proof creation
- `@digitalbazaar/eddsa-rdfc-2022-cryptosuite` — Ed25519 + RDF canonicalization cryptosuite
- `@digitalbazaar/ed25519-multikey` — key representation
- `@digitalbazaar/jsonld-document-loader` — for resolving schemas/contexts (with custom loader hitting our identity-service)

**Files**:
```
services/issuer-service/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── env.ts
│   ├── db.ts
│   ├── routes/
│   │   ├── issue.ts
│   │   └── revoke.ts
│   ├── vc/
│   │   ├── build-payload.ts     # claim → VC JSON-LD payload (unsigned)
│   │   ├── sign.ts              # @digitalbazaar/vc issue()
│   │   ├── vc-hash.ts           # canonicalize + sha256
│   │   └── document-loader.ts   # resolve our schemas/contexts via identity-service
│   └── client/
│       └── identity-service.ts  # POST to identity-service to get signing key
```

**Effort**: 5-7 days (JSON-LD canonicalization + document loader config is the tricky part)

---

### wallet-service

**Purpose**: store VCs encrypted; list/retrieve for owners.

**Port**: 8083 (private)

**Schema**:
```sql
CREATE TABLE wallet_keys (
  owner_did text PRIMARY KEY,
  wrapped_key bytea NOT NULL,              -- wallet AES key, wrapped by master key
  wrapping_method text NOT NULL,           -- 'env-master' for MVP; later 'kms' | 'passkey'
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_credentials (
  id text PRIMARY KEY,                     -- matches issuer's credentialId
  owner_did text NOT NULL REFERENCES wallet_keys(owner_did),
  credential_type text NOT NULL,
  schema_id text NOT NULL,
  vc_hash text NOT NULL UNIQUE,
  ciphertext bytea NOT NULL,               -- AES-256-GCM encrypted signed VC
  iv bytea NOT NULL,                       -- 12 bytes
  auth_tag bytea NOT NULL,                 -- 16 bytes
  status text NOT NULL DEFAULT 'active',
  summary jsonb NOT NULL,                  -- non-sensitive preview: employer name, role, dates
  issued_at timestamptz NOT NULL,
  expires_at timestamptz
);

CREATE INDEX wallet_credentials_owner_idx ON wallet_credentials(owner_did);

CREATE TABLE wallet_audit_log (
  id text PRIMARY KEY,
  owner_did text NOT NULL,
  action text NOT NULL,                    -- 'store' | 'list' | 'preview' | 'present' | 'revoke'
  credential_id text,
  occurred_at timestamptz NOT NULL DEFAULT NOW()
);
```

**HTTP endpoints**:

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/wallets/:did/credentials` | Store a signed VC (called by issuer-service) |
| GET | `/v1/wallets/:did/credentials` | List credentials (summary-only, no decrypt) |
| POST | `/v1/wallets/:did/credentials/:id/preview` | Decrypt + return full VC (owner preview) |
| POST | `/v1/wallets/:did/presentations` | Build a Verifiable Presentation wrapping one or more VCs |
| POST | `/v1/wallets/:did/credentials/:id/revoke` | (Stub) mark revoked — no status list yet |

**Libraries**:
- Node `crypto` for AES-256-GCM (built-in, zero deps)
- `@digitalbazaar/vc` for creating VPs via `signPresentation()`
- `hono`

**Files**:
```
services/wallet-service/
├── package.json
├── src/
│   ├── index.ts
│   ├── env.ts
│   ├── db.ts
│   ├── routes/
│   │   ├── credentials.ts       # POST/GET/POST preview, POST revoke
│   │   └── presentations.ts     # POST VP generation
│   ├── crypto/
│   │   ├── wrap-key.ts          # master-key wrap/unwrap for per-user AES keys
│   │   └── encrypt-vc.ts        # AES-256-GCM over VC JSON-LD
│   ├── client/
│   │   └── identity-service.ts  # for holder signing when building VPs
│   └── audit.ts                 # wallet_audit_log writer
```

**Effort**: 3-4 days

---

### Career-AI integration

**Changes in Career-AI**:

1. **New proxy routes** in `app/api/v1/ledger/`:
   - `POST /credentials/issue` → api-gateway `/v1/credentials/issue` (called from handleSave after verification)
   - `GET /wallet/credentials` → api-gateway `/v1/wallets/{did}/credentials`
   - `POST /wallet/credentials/:id/preview` → api-gateway proxy → wallet-service preview

2. **Bound DID on TalentIdentity**:
   - Add `bound_did text` column to `talent_identity`
   - Provision on first claim (call identity-service via api-gateway)
   - Server-side only — frontend never sees DIDs directly

3. **Badge rendering**:
   - `getCareerIdPresentation()` already emits `badges: []`. Populate from wallet-service list endpoint.
   - Add `CareerIdBadge.credentialId` to the schema so clicking routes to preview
   - Add `CareerIdBadge.credentialType` for icon selection

4. **Badge preview modal**:
   - Click badge → call preview endpoint → modal shows formatted VC contents + JSON view
   - "Verify" button → runs `@digitalbazaar/vc` verify against issuer DID document (resolved via `did:web` to `careera2a.com/.well-known/did.json`)
   - Green checkmark if signature valid

5. **Persist verification result on evidence row** (previously discussed):
   - Add `credential_id text` column to `career_builder_evidence`
   - Populated when issuance succeeds

**Effort**: 4-5 days

## Phase plan (compressed, ~3 weeks)

### Week 1: Infrastructure + identity-service

**Day 1 — Infrastructure**
- [ ] Point careera2a.com subpaths at identity-service (DNS)
- [ ] Create 3 new Railway services in CareerA2A project (empty shells)
- [ ] Generate issuer + wallet master keys locally, set as Railway env vars
- [ ] Design a `/career_ledger_services` Postgres DB inside existing Postgres (or separate)

**Day 2-3 — identity-service core**
- [ ] Scaffold Hono app, env loading, DB client
- [ ] Migration 0001: `user_dids`, `issuer_keys`
- [ ] `did/generate.ts`: Ed25519 keypair → multibase → did:web URL → DID document JSON
- [ ] `routes/did-document.ts`: serve issuer + user DID docs publicly
- [ ] `routes/dids.ts`: mint DID (idempotent on userId), lookup by userId
- [ ] Seed issuer keypair into `issuer_keys` on first boot (idempotent)
- [ ] Deploy + confirm `https://careera2a.com/.well-known/did.json` returns a real DID document
- [ ] Confirm `did:web:careera2a.com` resolves via `did-resolver` + `web-did-resolver` from an external shell

**Day 4 — identity-service signing + polish**
- [ ] `routes/sign.ts`: POST `/v1/dids/:did/sign` — signs arbitrary payload with the DID's key
- [ ] Rate limits, shared-secret auth middleware for internal endpoints
- [ ] Unit tests on DID generation + resolution + signing round-trip
- [ ] Document loader endpoint: serve `/contexts/employment/v1` + `/schemas/employment/v1` as static JSON

### Week 2: issuer-service + wallet-service

**Day 5-7 — issuer-service**
- [ ] Scaffold service
- [ ] Migration 0002: `issuance_log`
- [ ] `vc/build-payload.ts`: claim → VC JSON-LD (v2 shape, validFrom not issuanceDate, credentialSchema pointer, credentialStatus slot reserved with null values)
- [ ] `vc/document-loader.ts`: custom JSON-LD loader that resolves v2 context + employment context + schema via internal URLs
- [ ] `vc/sign.ts`: use `@digitalbazaar/vc` issue() with eddsa-rdfc-2022 cryptosuite; issuer key comes from identity-service via `POST /v1/dids/:did/sign` OR directly from env (decide: identity-service owns all keys, OR issuer has its own key; recommend identity-service owns so the migration to KMS is one change)
- [ ] `vc/vc-hash.ts`: canonicalize signed VC + SHA-256
- [ ] `routes/issue.ts`: request validation → build → sign → persist → return
- [ ] Write the employment JSON Schema and JSON-LD context, serve via identity-service
- [ ] End-to-end local test: issue a VC, verify it with `@digitalbazaar/vc` verifyCredential() standalone

**Day 8-10 — wallet-service**
- [ ] Scaffold service
- [ ] Migration 0003: `wallet_keys`, `wallet_credentials`, `wallet_audit_log`
- [ ] `crypto/wrap-key.ts`: generate per-user AES key → wrap with env-master → store
- [ ] `crypto/encrypt-vc.ts`: AES-256-GCM encrypt/decrypt for VCs
- [ ] `routes/credentials.ts`: POST store (unwrap user key → encrypt → persist), GET list (summary only), POST preview (unwrap → decrypt → return full VC)
- [ ] `routes/presentations.ts`: build a VP with @digitalbazaar/vc signPresentation() using holder DID's key via identity-service
- [ ] Audit log writes on every operation
- [ ] Integration test: issuer-service issues → wallet-service stores → list returns summary → preview decrypts → verify round-trip

### Week 3: Career-AI integration + E2E

**Day 11-12 — api-gateway orchestration**
- [ ] Add `IDENTITY_SERVICE_URL`, `ISSUER_SERVICE_URL`, `WALLET_SERVICE_URL` env
- [ ] Orchestrator hook: after verification verdict, if confidenceTier > SELF_REPORTED, call issuer → wallet
- [ ] New api-gateway routes: `POST /v1/credentials/issue` (proxies to issuer), `GET /v1/wallets/:did/credentials` (proxies to wallet), `POST /v1/wallets/:did/credentials/:id/preview`
- [ ] Return credential summary to Career-AI in the verdict response

**Day 13-14 — Career-AI UI**
- [ ] Add `bound_did` column to `talent_identity`, provisioning logic on first claim
- [ ] New Next.js API routes proxying to api-gateway
- [ ] Update `getCareerIdPresentation()` to populate `badges[]` from wallet-service
- [ ] Badge preview modal: fetch VC → pretty-render `credentialSubject` + show JSON tab
- [ ] "Verify this badge" button: run `verifyCredential()` client-side; fetch issuer DID document via standard `did:web` resolver

**Day 15 — E2E test + hardening**
- [ ] Happy path: upload offer letter → see badge → click → verify green
- [ ] Edge cases: no DID yet (first upload), already-issued credential (idempotency), revoked (stub path)
- [ ] Load test: 50 concurrent issuances
- [ ] Observability: each service logs correlationId on every request
- [ ] Deploy to Railway, smoke test on careera2a.com URLs

## Tracker

Copy the checkbox list above into `docs/feature-tracker.md` or use this file directly. Top-level milestones:

- [ ] **M1** Infrastructure setup (Day 1)
- [ ] **M2** identity-service issuing + hosting DIDs (Day 4)
- [ ] **M3** issuer-service issuing signed W3C VCs verifiable standalone (Day 7)
- [ ] **M4** wallet-service storing + presenting VCs (Day 10)
- [ ] **M5** api-gateway orchestrating issue → wallet flow (Day 12)
- [ ] **M6** Career-AI badge UI with verify button (Day 14)
- [ ] **M7** E2E demo on prod URLs (Day 15)

## DEMO-STUB → real migration paths

Each deferred piece has a bounded, additive migration. No VC data is migrated; signatures stay valid; users don't see disruption.

### A. Issuer key: env var → AWS KMS

**Current state (MVP):** `ISSUER_ED25519_PRIVATE_KEY_HEX` in Railway env. identity-service signs via `@noble/ed25519`.

**Problem AWS KMS solves:** private key exposure risk (Railway dashboard access, log leaks, backup leaks).

**Migration (1-2 days):**
1. Create a new AWS KMS key. Important: **ECDSA P-256** or P-384 (KMS doesn't sign Ed25519 natively). This is a **cryptosuite change** from `eddsa-rdfc-2022` to `ecdsa-rdfc-2022`.
2. Install `@aws-sdk/client-kms` + `@digitalbazaar/ecdsa-rdfc-2022-cryptosuite`.
3. Implement `keys/kmsProvider.ts` — signs via `kms.sign()`, returns proof value in the shape data-integrity expects.
4. Add a new verification method `#key-2` (KMS-backed ECDSA) to the issuer's DID document alongside the existing `#key-1` (env Ed25519).
5. Flip a feature flag so new VCs use `#key-2`. Old VCs stay verifiable via `#key-1`.
6. After some grace period (all active credentials reference the new key), mark `#key-1` as retired in the DID document. Keep it in the document indefinitely for historical VC verification.

**Impact on existing VCs:** zero. Each VC embeds `proof.verificationMethod` with its signing key. Verifiers fetch the DID document and find the referenced key.

**Cost:** $1/month per KMS key + ~$0.03/10k signing requests. Free tier covers 20k requests/month.

### B. User DID keys: env wrap → AWS KMS wrap

**Current state:** Every user DID's private key wrapped by `WALLET_MASTER_KEY_HEX` in env.

**Migration (similar to A but for wallet-service's master key):**
1. Create a 2nd KMS key for wallet wrapping.
2. Re-wrap every row in `wallet_keys` using KMS instead of env master: `decrypt-with-env → encrypt-with-kms`. One-time data migration; ~1 second per user.
3. Flip `wrapping_method` column from `'env-master'` to `'kms'`.
4. Remove env var from Railway.

**Impact on users:** zero (no UX change). Internal-only.

**Effort:** 1 day including the migration script.

### C. Identity proofing: none → Persona (or Stripe Identity)

**Current state:** users get DIDs with no proofing. No `IdentityVerifiedCredential` exists.

**Migration (~1 week):**
1. Pick provider. Recommend Stripe Identity for fastest integration ($1.50/verification, known pricing) or Persona for configurability.
2. Add `identity_proofings` table to identity-service schema.
3. New routes: `POST /v1/proofings/start`, `POST /v1/proofings/webhook`, `GET /v1/dids/:did/proofing-status`.
4. New Career-AI flow: "Verify identity" CTA in Career ID → redirects to provider → webhook confirms → mint `IdentityVerifiedCredential` to the same user DID.
5. Anti-sybil: hash `(DOB + government_id_number)` → reject duplicates at proofing time.
6. Badge UI surfaces an "Identity Verified" badge alongside employment badges for users who've proofed.

**Impact on existing employment badges:** zero. They're additive, not dependent. `IdentityVerifiedCredential` is a separate VC pointing to the same DID.

**Cost:** per-verification fee. Defer until you have a reason to spend it (recruiter demands, abuse pressure, enterprise sales gate).

### D. Revocation: no status → BitstringStatusList

**Current state:** VCs have `credentialStatus: null` (or the field is omitted). No revocation possible.

**Migration (~3-5 days):**
1. New `services/status-service/` (or add to existing) — hosts BitstringStatusList VCs as JSON.
2. Schema: `status_lists (id, purpose, encoded_list, length, next_available_index, updated_at)`.
3. Issuer assigns `statusListIndex` to every new credential going forward.
4. Public endpoint at `careera2a.com/status/<listId>` serves the status list as a signed VC.
5. Revocation endpoint flips the bit at the credential's index + re-signs the list.
6. For **existing non-revocable** VCs: either backfill (assign indices, mark all as `active=0` bit) or document as permanently non-revocable.

**Impact on existing VCs:** depends on backfill decision. Most teams backfill; it's cheap.

### E. Wallet key custody: server-only → passkey-wrapped

**Current state:** wallet service holds the wrapping key in env/KMS. Server can decrypt any VC.

**Migration (~1 week):**
1. Add `passkey_wrapped_key bytea` + `webauthn_credential_id bytea` columns to `wallet_keys`.
2. New WebAuthn enrollment flow in Career-AI (uses `@simplewebauthn/browser` + `@simplewebauthn/server`).
3. On enrollment: browser derives a local secret → XOR with the user's wallet AES key → stores on server (server can't decrypt without the user's passkey). Or use HPKE / the derived key wraps.
4. Preview flow: user-present operations require a passkey challenge; async operations (recruiter verification) use KMS path.

**Impact:** additive; existing VCs stay decryptable server-side (hybrid custody by design).

### F. Email provider: none → AWS SES

**When needed:** identity proofing, revocation notifications, recovery flows.

**Migration (~1 day):**
1. Verify sending domain on AWS SES (~15 min, DNS TXT record).
2. Install `@aws-sdk/client-sesv2`.
3. Add `send-email.ts` helper in each service that needs it.
4. Move out of SES sandbox (request production access — approval takes ~24 hours).

**Cost:** $0.10 per 1000 emails. Negligible.

### G. SD-JWT-VC selective disclosure

**When needed:** recruiter flows where the user wants to share only specific fields (employer + dates, but not role).

**Migration (~2 weeks):**
1. Install `@sd-jwt/sd-jwt-vc` (OpenWallet Foundation) or `@sphereon/ssi-sdk.sd-jwt`.
2. New issuance path in issuer-service: same claim, but disclosures are nested + salted.
3. New presentation path in wallet-service: user selects which disclosures to include.
4. Verifier side: recruiter verifies reconstructed credential.

**Impact on existing VCs:** zero. SD-JWT-VCs are a parallel format, not a replacement.

### H. OID4VCI / OID4VP wallet interop

**When needed:** integration with external wallet apps (Apple Wallet, Google Wallet, EUDI-aligned wallets).

**Migration (~3-4 weeks):**
1. Implement OID4VCI issuance endpoint for external wallets to pull VCs.
2. Implement OID4VP presentation endpoint for verifiers to request credentials.
3. Pre-authorized code flow + credential offer deep links.
4. This is a major feature, not a one-file change — scope it as its own spec.

### I. api-gateway + services → AWS KMS per Railway best practice

**Optional hardening:** rather than each service having direct KMS access, use IAM roles per Railway service. Railway supports this via their integrations. Gives least-privilege: issuer-service can sign but not unwrap wallet keys; wallet-service can unwrap but not sign VCs.

## Migration path summary

| Piece | MVP | Real | Effort | Cost |
|---|---|---|---|---|
| A. Issuer key | env var | AWS KMS (ECDSA) | 1-2 days | $1/mo |
| B. Wallet wrap key | env var | AWS KMS | 1 day | $1/mo |
| C. Identity proofing | none | Persona / Stripe Identity | 1 week | $0.50-$3/verification |
| D. Revocation | none | BitstringStatusList | 3-5 days | $0 (compute) |
| E. Wallet custody | server-only | passkey-wrapped | 1 week | $0 |
| F. Email | none | AWS SES | 1 day | $0.10/1000 |
| G. SD-JWT-VC | full-VC only | selective disclosure | 2 weeks | $0 |
| H. OID4VCI/VP | none | external wallet interop | 3-4 weeks | $0 |
| I. Per-service IAM | shared secrets | least-privilege roles | 2-3 days | $0 |

**Total: every production hardening step is bounded, independent, and purely additive.**

## Dollar cost over time

| Stage | Railway | KMS | Identity | Email | Monthly total |
|---|---|---|---|---|---|
| MVP (end of week 3) | ~$15 | $0 | $0 | $0 | **~$15** |
| + KMS (~1 month after MVP) | ~$15 | ~$3 | $0 | $0 | **~$18** |
| + Identity proofing (rollout) | ~$15 | ~$3 | $1-3 × new users | $0 | variable |
| + Email + hardening | ~$20 | ~$5 | variable | ~$1 | variable |

## Open questions

- **Should identity-service own all signing keys (issuer + per-user) or should issuer-service have its own key?** Recommend identity-service owns everything for single-point KMS migration. Issuer just asks identity-service to sign.
- **User DID naming:** `did:web:careera2a.com:u:<sha256(userId).slice(0,16)>` vs `:u:<uuid>`? Hash is deterministic + private-ish. UUID is simpler. Recommend hash for determinism (avoids data migration if user ID collisions happen).
- **Where does bound_did live — identity-service or Career-AI?** Source of truth: identity-service. Career-AI caches it on `talent_identity.bound_did` to avoid a lookup on every badge render.
- **Schema evolution:** when EmploymentCredential v2 ships, what happens to v1 VCs? They reference `/schemas/employment/v1` which stays live forever (immutable URLs). v2 gets a new URL. Verifiers see both.
- **Document loader security:** our custom JSON-LD loader must refuse to fetch arbitrary URLs (JSON-LD injection risk). Whitelist only our domain + the W3C + w3id.org contexts.
- **Where does Career-AI's verification UI get the issuer DID?** Hardcode `did:web:careera2a.com` in the Verify button handler, resolve via standard `did:web` resolver, cache the DID document for 24h.

## References

- VC Data Model 2.0 Recommendation: https://www.w3.org/TR/vc-data-model-2.0/
- DataIntegrity (eddsa-rdfc-2022): https://www.w3.org/TR/vc-di-eddsa/
- BitstringStatusList: https://www.w3.org/TR/vc-bitstring-status-list/
- did:web spec: https://w3c-ccg.github.io/did-method-web/
- @digitalbazaar/vc: https://github.com/digitalbazaar/vc
- OID4VCI: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
- OpenWallet Foundation SD-JWT: https://github.com/openwallet-foundation/sd-jwt-js
- AWS KMS pricing: https://aws.amazon.com/kms/pricing/
- Stripe Identity pricing: https://stripe.com/identity/pricing
- Persona: https://withpersona.com/pricing

## Verification criteria

End of Week 3, before declaring done:

- [ ] `curl https://careera2a.com/.well-known/did.json` returns a valid DID document
- [ ] `curl https://careera2a.com/u/<anyhash>/did.json` returns a valid user DID document (or 404 cleanly)
- [ ] `curl https://careera2a.com/schemas/employment/v1` returns a valid JSON Schema
- [ ] `curl https://careera2a.com/contexts/employment/v1` returns a valid JSON-LD context
- [ ] Local script: issue a VC via api-gateway → fetch it via wallet → verify it standalone with `@digitalbazaar/vc verifyCredential()` → green
- [ ] Career-AI demo: upload offer letter → badge appears → click → VC JSON visible → "Verify" button → green checkmark
- [ ] Signature tampering test: flip a character in a VC → verify → red X
- [ ] Issuer key rotation test (dry run): prepare a second DID verification method in the DID document → sign a new VC with it → verify correctly
- [ ] Revocation stub: POST revoke endpoint returns 200 and marks row in issuance_log

## Non-goals reminder

This spec does **not** cover:
- Education, Certification, Skill, Endorsement credential types (T3)
- Employer Agent A2A attestation (T5)
- Chain anchoring (T8)
- Reputation scoring or matching (T6)
- Candidate-agent runtime (T5)

Those land in their own specs. This spec gets us from "no badges" to "real W3C VCs end-to-end for employment claims" — the foundation every later badge type builds on.
