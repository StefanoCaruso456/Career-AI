# 001-issuer-wallet-mvp

**Status**: Draft
**Owner**: fsyed
**Related**: feature-tracker "identity-service / wallet-service / issuer-service" (T1–T2), demo priority items 2, 3, 4. Plan phase T1+T2 collapsed for demo velocity.

## Problem

Today the backend verifies a document and returns a verdict — nothing persistent is produced and the user has no wallet, no badge, and no way to share the result. For the streamed demo, the product thesis requires that a successful verification produces a real W3C Verifiable Credential, that the credential lives in a per-user encrypted wallet, and that the user can see the badge in a UI. This spec covers the minimum work to ship items 2, 3, and 4 from the demo priority list: `issuer-service`, `wallet-service`, and the plumbing between them.

## Scope

**In**
- `issuer-service` — stateless HTTP service that takes an approved verification and emits a signed W3C VC + `vcHash`
- `wallet-service` — stateful HTTP service that owns per-user encrypted VC storage, encryption key lifecycle, and a decrypt-for-preview endpoint
- A canonical `EmploymentCredential` VC shape defined once in `@career-protocol/badge-schemas` and consumed by both services
- Issuer signing key material (single key, env-vault for demo, KMS later)
- Per-user wallet DEK (data encryption key) wrapped by a per-user KEK (stubbed as session-derived for demo; passkey in post-demo)
- `api-gateway` orchestrator updated to call `issuer-service` after a successful verdict and to list a user's credentials back to Career-AI
- `vcHash = sha256(canonicalize(signed_vc))` computed and persisted at issuance (chain-forward compatibility guarantee from plan.md)
- One end-to-end test: upload real `signed.pdf` → see a decrypted badge in the wallet list

**Out**
- `identity-service` and ID.me integration — stubbed for demo. User account = fake `did:key` generated at account creation, no uniqueness check.
- Real WebAuthn/passkey — wallet KEK derived from a demo session secret. Clearly labeled as demo-only.
- SD-JWT-VC selective disclosure — demo uses plain W3C VCDM 2.0 JSON-LD. SD-JWT-VC migration is a follow-up spec.
- Verifiable Presentation generation / recruiter-side verification flow
- `StatusList2021` revocation — `credentialStatus` is emitted as a stable URL but the hosted list is always "active" for demo
- Disaster-recovery wallet exports
- Multi-badge-type schemas — employment is the only type for demo
- Career-AI frontend wiring + wallet UI panel — tracked in a separate spec `002-career-ai-wallet-ui.md`
- `verify-and-forget` artifact purge — the policy exists in code but the consumer of `credential.issued` that purges Career-AI's S3 bucket is deferred

## Design

### Service shape

```
Career-AI
   │  POST /v1/claims/employment  (file + certificate? + claim)
   ▼
api-gateway (:8080) ──► document-verifier (:8787) ──► pdf-extractor (:8788)
   │
   │  on verdict ≥ EVIDENCE_SUBMITTED:
   ▼
issuer-service (:8090)
   │  builds canonical VC, signs with issuer DID key, computes vcHash
   ▼
wallet-service (:8091)
   │  receives PLAINTEXT VC + ownerDid
   │  encrypts with per-user DEK, stores ciphertext
   ▼
Postgres (wallet schema)
```

### Key decisions

- **VC format**: plain W3C VCDM 2.0 JSON-LD for demo. Migrates to SD-JWT-VC post-demo. Rationale: SD-JWT-VC adds compact-form + disclosure complexity that the demo doesn't exercise; the JSON-LD shape is valid W3C VC and verifiable by off-the-shelf libraries today.
- **Signing algorithm**: EdDSA (Ed25519). Fast, small signatures, well supported. Use Node `crypto.subtle` for signing.
- **Canonicalization**: JSON Canonicalization Scheme (JCS, RFC 8785). Stable across field order and whitespace — required for `vcHash` to be reproducible.
- **Issuer DID**: `did:web:localhost:8090` behind a resolvable `/.well-known/did.json` endpoint on `issuer-service`. Switch to real domain post-demo with a single config change.
- **Wallet encryption**: AES-256-GCM. Per-user DEK generated at wallet creation, wrapped by a per-user KEK. For demo, KEK is derived deterministically from a session token (`HKDF-SHA256(session_secret, "career-ledger-wallet-kek", ownerDid)`). Real WebAuthn-bound KEK is a post-demo upgrade — the DEK schema does not change.
- **Who does the encryption?** `wallet-service` encrypts. `issuer-service` sends plaintext VC over internal network to `wallet-service`. Rationale: cleaner separation of concerns, `issuer-service` never touches user keys.
- **Storage**: `wallet-service` shares the existing Postgres instance (port 5433) with a separate schema `wallet`. `issuer-service` is stateless (no DB).
- **Event emission**: `credential.issued` is emitted as a direct in-process hook for demo. Extract to a real event bus in a later phase.
- **Tiers and floors**: `issuer-service` refuses to issue if the verdict is below `EVIDENCE_SUBMITTED`. `SELF_REPORTED` verdicts produce no VC — the claim stays in `api-gateway.claims` with status `REJECTED_LOW_CONFIDENCE`.

### Service boundaries

| Concern | Owner |
|---|---|
| Signing key access | issuer-service |
| VC JSON construction | issuer-service |
| `vcHash` computation | issuer-service |
| Issuance hooks (future chain anchor) | issuer-service |
| Encryption key lifecycle | wallet-service |
| VC ciphertext storage | wallet-service |
| Decrypt-for-preview | wallet-service |
| Credential listing | wallet-service (via api-gateway passthrough) |

Shared contract: the canonical VC shape and the `credential.issued` event payload are defined in `@career-protocol/badge-schemas` (already scaffolded). Both services depend on that package via workspace import.

## Data model / API

### issuer-service (:8090)

- `POST /v1/credentials/issue`
  - Auth: internal shared secret (not the Career-AI secret)
  - Body:
    ```ts
    {
      ownerDid: string;             // subject — where the VC lives
      claim: EmploymentClaim;       // employer, role, start, end
      verification: {
        verificationRecordId: string;
        confidenceTier: "EVIDENCE_SUBMITTED" | "REVIEWED" | "SOURCE_CONFIRMED" | "MULTI_SOURCE_CONFIRMED";
        artifactHash: string;       // sha256 of source PDF
        method: "document-upload" | "payroll-sync" | "endorsement";
      }
    }
    ```
  - Response:
    ```ts
    {
      credentialId: string;         // uuid
      vcHash: string;               // sha256(jcs(signed_vc))
      issuedAt: string;             // ISO8601
    }
    ```
  - Side effect: pushes plaintext VC to `wallet-service POST /v1/wallets/:ownerDid/credentials`. Response only returns once wallet storage succeeds.
- `GET /.well-known/did.json` — public issuer DID document with Ed25519 verification key
- `GET /v1/health`

### wallet-service (:8091)

- `POST /v1/wallets`
  - Called at account creation
  - Body: `{ ownerDid: string }`
  - Creates wallet row with a fresh DEK, DEK wrapped by session-derived KEK
- `POST /v1/wallets/:ownerDid/credentials`
  - Auth: internal shared secret (issuer-service only)
  - Body: `{ credentialId, vcHash, credentialType, vcPayload }` — `vcPayload` is plaintext JSON
  - Encrypts `vcPayload` with the wallet's DEK, stores ciphertext
- `GET /v1/wallets/:ownerDid/credentials`
  - Auth: user session token
  - Returns list of `{ credentialId, vcHash, credentialType, issuedAt, status }` — no ciphertext, no plaintext
- `POST /v1/wallets/:ownerDid/credentials/:credentialId/decrypt`
  - Auth: user session token (passkey stub)
  - Decrypts DEK with session-derived KEK, decrypts ciphertext, returns plaintext VC for preview
  - Plaintext never leaves the response — not logged, not audited beyond a counter
- `GET /v1/health`

### Postgres schema (new `wallet` schema in existing DB)

```sql
CREATE SCHEMA IF NOT EXISTS wallet;

CREATE TABLE wallet.wallets (
  owner_did       TEXT PRIMARY KEY,
  wrapped_dek     BYTEA NOT NULL,
  dek_iv          BYTEA NOT NULL,
  kek_salt        BYTEA NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet.credentials (
  id              UUID PRIMARY KEY,
  owner_did       TEXT NOT NULL REFERENCES wallet.wallets(owner_did),
  credential_id   TEXT NOT NULL UNIQUE,   -- VC id, urn:uuid:...
  vc_hash         TEXT NOT NULL,          -- sha256 of canonicalized signed VC
  credential_type TEXT NOT NULL,          -- "EmploymentCredential"
  ciphertext      BYTEA NOT NULL,
  iv              BYTEA NOT NULL,
  auth_tag        BYTEA NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  issued_at       TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_credentials_owner ON wallet.credentials(owner_did);
```

### VC payload shape (canonical)

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://schemas.career-ledger.example/employment/v1"
  ],
  "id": "urn:uuid:<uuid>",
  "type": ["VerifiableCredential", "EmploymentCredential"],
  "issuer": "did:web:localhost%3A8090",
  "validFrom": "2026-04-15T12:00:00Z",
  "credentialSubject": {
    "id": "did:key:z6Mk...",
    "employer": { "name": "Acme Corp" },
    "role": "Senior Software Engineer",
    "employmentPeriod": {
      "startDate": "2022-03-01",
      "endDate": null
    },
    "confidenceTier": "REVIEWED"
  },
  "credentialSchema": {
    "id": "https://schemas.career-ledger.example/employment/v1",
    "type": "JsonSchema"
  },
  "credentialStatus": {
    "id": "https://status.career-ledger.example/v1/0#0",
    "type": "StatusList2021Entry",
    "statusPurpose": "revocation"
  },
  "evidence": [{
    "id": "urn:evidence:<verificationRecordId>",
    "type": ["DocumentEvidence"],
    "verificationMethod": "document-upload",
    "artifactHash": "sha256:...",
    "reviewedAt": "2026-04-15T12:00:00Z"
  }],
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-04-15T12:00:00Z",
    "verificationMethod": "did:web:localhost%3A8090#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z..."
  }
}
```

## Test plan

Manual end-to-end on the streamed demo path:

1. **Account creation** — `POST /v1/accounts` on api-gateway with a fake email. Returns `{ accountId, ownerDid }` where `ownerDid` is a freshly generated `did:key`. Wallet is created in the same transaction.
2. **Upload genuine document** — `POST /v1/claims/employment` with `signed.pdf` + claim JSON. api-gateway orchestrates verify → issue → store. Response includes `credentialId` and `vcHash`.
3. **List wallet** — `GET /v1/wallets/:ownerDid/credentials` returns a single entry, no plaintext.
4. **Decrypt for preview** — `POST .../decrypt` returns the plaintext VC. Visually confirm `credentialSubject.employer.name` matches the claim, `proof.proofValue` is present, `evidence[0].artifactHash` matches the uploaded PDF.
5. **Tamper path** — flip a bit in `signed.pdf`, re-upload. Expect verdict `FAILED` at `SELF_REPORTED` tier, api-gateway refuses to call issuer-service, no credential appears in wallet.
6. **External verification** — run the signed VC through a third-party W3C VC verifier library (`@digitalbazaar/vc-js` or similar). Expect signature valid + issuer DID resolves + schema ID resolves.

Automated (stretch, time-permitting):
- Unit: `buildEmploymentVc(claim, verification, ownerDid)` produces a schema-valid payload.
- Unit: sign then verify round-trip with a fresh Ed25519 keypair.
- Unit: encrypt then decrypt round-trip with a fresh DEK.
- Integration: hit `issuer-service POST /v1/credentials/issue` with an in-process wallet-service stub, assert ciphertext row lands in Postgres.

## Open questions

1. **Do we need a wallet-UI spec before or after this one?** This spec leaves Career-AI frontend wiring to `002-career-ai-wallet-ui.md`. The demo isn't useful without the UI, so `002` needs to start roughly when this one is half-built. Decision needed: single dev doing both sequentially, or split.
2. **Real passkey or stubbed session key for demo?** Stubbed is ~3 days faster. Real passkey is the product story investors will ask about on stream. Lean: stub + script a talking point that says "in production this is bound to a WebAuthn credential — the same pattern Apple Pay uses".
3. **Where does the wallet-service DEK root live?** For demo, a single environment secret on the wallet-service host. Post-demo, this is a KMS-managed symmetric key, with per-user DEKs wrapped by per-user KEKs that are themselves passkey-bound. Current spec is explicit that this is demo-only crypto.
4. **`did:web:localhost%3A8090` is demo-only**. When we host the stream, the issuer DID has to resolve over the public internet for external W3C verifier libraries to work. Either stand up a real domain before the stream or switch to `did:key` (self-contained, no resolver needed). Decision deadline: one week before stream.
5. **Schema hosting** — `https://schemas.career-ledger.example/...` is a placeholder. Either stand up a real `schemas.` subdomain or accept that external verifiers will fail the schema fetch (signature check still succeeds). Lean: register a real domain before the demo or inline-host the schema on issuer-service at `/schemas/employment/v1.json`.

## Migration / rollout

- New services, no existing contracts to break.
- `api-gateway` orchestrator gains one new step after verdict aggregation. Add behind a feature flag `ISSUE_ON_VERIFY` so pre-demo the existing verification-only path still works for tests.
- New Postgres schema `wallet`. Add a new idempotent migration file `src/db/migrations/002_wallet.sql` in `api-gateway` — wallet-service reads the same DB but writes are gated through its own service to keep the schema-owner boundary clear.
- New env vars:
  - `ISSUER_SERVICE_URL` (api-gateway)
  - `WALLET_SERVICE_URL` (issuer-service)
  - `ISSUER_SIGNING_KEY` (issuer-service, Ed25519 private key, base64)
  - `WALLET_SESSION_SECRET` (wallet-service, HKDF input for KEK derivation)
  - `INTERNAL_SHARED_SECRET` (issuer ↔ wallet auth; distinct from Career-AI secret)
- Demo-only stubs are explicit in code (`// DEMO STUB: passkey-bound KEK replaces this post-demo`) so post-demo hardening has a grep target.
