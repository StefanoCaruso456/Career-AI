# 004-endorsement-service

**Status**: Draft
**Owner**: fsyed
**Related**: depends on [`001-issuer-wallet-mvp.md`](./001-issuer-wallet-mvp.md) and [`002-career-ai-wallet-ui.md`](./002-career-ai-wallet-ui.md). Delivers demo priority item 6. Plan phase T3 (endorsement portion) pulled forward for demo.

## Problem

Items 1 (document upload) and 5 (payroll sync) cover structured verification paths — they produce `REVIEWED` and `SOURCE_CONFIRMED` credentials respectively. The demo also needs to show the **social signal** path: a user asks a manager or coworker to vouch for them, the endorser submits a short statement, and the system issues a lowest-tier credential the user can display in their wallet. This is the first non-employment badge type and it proves the platform's extensibility beyond the two structured paths. The demo version does *not* need collusion detection, endorser-identity binding, or graph analysis — those are the real moat of the production endorsement system and are explicitly deferred.

## Scope

**In**
- New `endorsement-service` (Hono, :8093) hosting request creation, magic-link generation, public submission handler, and issuance wiring
- New `EndorsementCredential` VC type defined in `@career-protocol/badge-schemas` — the first non-employment type
- `POST /v1/endorsements/request` (internal, called via Career-AI proxy) — creates a pending request + signed magic token
- `GET /endorse/:token` (public, unauthenticated) — small standalone HTML page where the endorser types their name, relationship, and a one-sentence message
- `POST /v1/endorsements/:token/submit` (public, unauthenticated) — verifies token, writes submission, calls `issuer-service` with `method: "endorsement"` and tier `SELF_REPORTED`
- Career-AI wallet gains a "Request endorsement" button that opens a small form
- For demo, magic-link delivery is **console-logged** on sync-service, not emailed — the presenter copies the link into a second browser on camera or pre-opens it during rehearsal
- Wallet card style for `EndorsementCredential` that visibly labels tier as `SELF_REPORTED` and clearly states the endorser's self-claimed identity
- The token itself is a signed JWT (HS256 with a service-local secret) with 7-day expiry and single-use enforcement via DB state

**Out**
- Real email delivery — demo uses console logs + copy/paste in the rehearsed script
- Endorser identity binding — the endorser is a string (name + email they type in), not a verified DID. This is called out on the badge itself.
- Collusion detection — no graph signals, no sybil checks, no endorser reputation
- Endorser having their own wallet — endorsers don't get accounts
- Relationship verification — if endorser claims "Manager at Acme Corp 2020–2024", we do not verify that
- Endorser-of-endorser chains
- Revoking endorsements (StatusList2021) — same status-list stub as `001`
- Multi-party endorsements — one endorser per request
- Rate limiting on the public submission endpoint — nice-to-have, not a demo blocker
- Endorsement tier upgrades (e.g. bump to `EVIDENCE_SUBMITTED` if the endorser is a verified user) — deferred to post-demo

## Design

### Topology

```
Career-AI (/wallet/endorsements/new)
    │  POST /api/v1/ledger/endorsements/request
    ▼
Next.js proxy (server-side, adds shared secret)
    │  POST /v1/endorsements/request
    ▼
endorsement-service :8093
    │  INSERT pending request, generate signed magic token
    │  DEMO: console.log("Endorsement link:", magicUrl)
    ▼
(Human endorser copies link into second browser tab)
    │
    ▼
endorsement-service serves  GET /endorse/:token
    │  (standalone HTML, no JS framework)
    │  endorser types name + relationship + 1 sentence → submits
    ▼
POST /v1/endorsements/:token/submit
    │  verifies token, marks request used, calls issuer-service
    ▼
issuer-service (existing from 001)
    │  builds EndorsementCredential, signs, pushes to wallet
    ▼
wallet-service → Career-AI wallet shows new badge
```

Why endorsement-service hosts its own public HTML page instead of living under Career-AI: the endorser is a third party who doesn't have a Career-AI account and shouldn't need one for the demo. Hosting the submission page on endorsement-service keeps it self-contained — no cross-origin auth, no session dance, no dependency on the Career-AI Next.js build being up. The page is intentionally small (server-rendered, inline CSS, no JS framework) so the on-stream fetch feels instantaneous.

### Magic token

- JWT signed HS256 with `ENDORSEMENT_TOKEN_SECRET`
- Claims: `{ endorsementRequestId, iat, exp (7 days) }`
- Single-use: enforced by `endorsement.requests.status` transitioning from `pending` → `submitted`. Second submission attempts with the same token return 410 Gone.
- URL format: `GET https://endorsement.career-ledger.example/endorse/:token`

### EndorsementCredential VC shape

First non-employment VC. Distinct shape, reusable schema pattern.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://schemas.career-ledger.example/endorsement/v1"
  ],
  "id": "urn:uuid:<uuid>",
  "type": ["VerifiableCredential", "EndorsementCredential"],
  "issuer": "did:web:localhost%3A8090",
  "validFrom": "2026-04-15T12:00:00Z",
  "credentialSubject": {
    "id": "did:key:z6Mk...<subject>",
    "endorsedBy": {
      "nameClaimed": "Samira Patel",
      "emailClaimed": "samira@example.com",
      "relationshipClaimed": "Former manager at Acme Corp"
    },
    "message": "Worked with Alex for three years. One of the strongest ICs I've managed.",
    "context": {
      "employerNameClaimed": "Acme Corp",
      "roleNameClaimed": "Senior Software Engineer"
    },
    "confidenceTier": "SELF_REPORTED"
  },
  "credentialSchema": {
    "id": "https://schemas.career-ledger.example/endorsement/v1",
    "type": "JsonSchema"
  },
  "credentialStatus": { /* same stub as 001 */ },
  "evidence": [{
    "id": "urn:evidence:<endorsementRequestId>",
    "type": ["PeerEndorsementEvidence"],
    "verificationMethod": "endorsement",
    "endorsementRequestId": "<uuid>",
    "submittedAt": "2026-04-15T12:00:00Z"
  }],
  "proof": { /* Ed25519Signature2020 from issuer */ }
}
```

Every endorser-supplied field uses the suffix `Claimed` or the wrapper `endorsedBy`. This is a design choice: the badge should never be readable as "verified that Samira worked at Acme" — because we didn't verify that. The UI must render these fields with unmistakable "as claimed by endorser" framing.

### Confidence tier policy

`SELF_REPORTED` is the ceiling for this flow. No exceptions in the demo. The only way to upgrade is a post-demo feature where the endorser signs in and proves their own identity, which binds their claimed fields to a verified DID — that can promote the tier. Noted as deferred.

## Data model / API

### endorsement-service Postgres schema

```sql
CREATE SCHEMA IF NOT EXISTS endorsement;

CREATE TABLE endorsement.requests (
  id                      UUID PRIMARY KEY,
  requester_did           TEXT NOT NULL,
  endorser_email_claimed  TEXT NOT NULL,
  context_employer        TEXT NULL,
  context_role            TEXT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending',   -- pending|submitted|expired
  token_jti               TEXT NOT NULL UNIQUE,              -- for single-use enforcement
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_endorsement_requests_requester ON endorsement.requests(requester_did);

CREATE TABLE endorsement.submissions (
  id                      UUID PRIMARY KEY,
  request_id              UUID NOT NULL REFERENCES endorsement.requests(id),
  endorser_name_claimed   TEXT NOT NULL,
  endorser_relationship   TEXT NOT NULL,
  message                 TEXT NOT NULL,
  submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  credential_id           TEXT NULL       -- populated after successful issuance
);
```

### endorsement-service HTTP API (:8093)

- `POST /v1/endorsements/request`
  - Auth: internal shared secret
  - Body: `{ requesterDid: string; endorserEmailClaimed: string; contextEmployer?: string; contextRole?: string }`
  - Response: `{ requestId: string; magicUrl: string; expiresAt: string }`
  - Side effect: INSERT `endorsement.requests`, `console.log("Endorsement link:", magicUrl)` for demo

- `GET /endorse/:token`
  - Public, unauthenticated
  - Verifies JWT, loads request, returns a small server-rendered HTML page with a form
  - If expired: render a friendly "This link has expired" page
  - If already submitted: render "This endorsement has already been submitted" page

- `POST /v1/endorsements/:token/submit`
  - Public, unauthenticated
  - Body: `{ endorserNameClaimed: string; endorserRelationship: string; message: string }`
  - Verifies JWT → loads request → transitions status atomically `pending → submitted` → INSERTs submission → calls `issuer-service POST /v1/credentials/issue` with full shape
  - Response: a success HTML page showing "Thank you, your endorsement has been submitted"

- `GET /v1/endorsements/pending/:ownerDid`
  - Auth: internal shared secret
  - Returns list of `{ requestId, endorserEmailClaimed, contextEmployer, contextRole, createdAt, status }` — used by the Career-AI `/wallet` page to show pending endorsement requests

- `GET /v1/health`

### Career-AI proxy routes

- `POST /api/v1/ledger/endorsements/request`
  - Auth: `getServerSession()` → `boundDid`
  - Forwards to endorsement-service `POST /v1/endorsements/request`
  - Returns `{ requestId, magicUrl }` to the caller. **For the demo only**, the `magicUrl` is returned to the browser so the presenter can copy-paste it on stream. Post-demo, the URL should never leave the server — email delivery only.

- `GET /api/v1/ledger/endorsements/pending`
  - Forwards to endorsement-service `GET /v1/endorsements/pending/:boundDid`

### Career-AI frontend additions

1. **New `/wallet/endorsements/new` route** — simple form:
   - Endorser email (text)
   - Endorser relationship hint (text, optional, e.g. "Former manager")
   - Job context (employer + role — pre-filled if user has an employment badge to anchor to)
   - Submit → shows the magic URL + a "Copy link" button + "Open in new tab" button

2. **Pending requests strip on `/wallet`**: small list above the badge grid showing pending endorsement requests with expiry timers. Empty by default.

3. **New wallet card style for `EndorsementCredential`**: different accent color, quote icon, visible tier chip `SELF_REPORTED`, prominent "as claimed by endorser" tagline underneath the endorser name. The tier chip should look *less prominent* than the `REVIEWED` chip — ranking is part of the story.

### endorsement-service public page styling

Self-contained HTML, minimal inline CSS, matches the Career-AI dark theme enough to not look like a different product. No framework, no bundler. Roughly:

- Header: "Endorse [User's display name]" (display name sourced from Career-AI via an internal `/v1/users/display-name/:did` call at page-render time — falls back to "a Career Ledger user" if lookup fails)
- Subhead: "Your endorsement will be recorded as a verifiable credential signed by Career Ledger."
- Form: name, relationship, message (textarea, ~280 char limit)
- Submit button
- Small "What is this?" link → expands to a one-paragraph explainer

## Test plan

Live rehearsal path (item 6 in the demo script):

1. User is already signed in, on `/wallet`. Has badges from items 1 and 5.
2. Click **"Request an endorsement"** (top of wallet page).
3. Form at `/wallet/endorsements/new` opens. Pre-filled with employer/role from an existing badge.
4. Enter endorser's email, relationship hint. Submit.
5. Card shows: "Request created. Send this link to Samira: [magicUrl]" with a "Copy" button.
6. Presenter switches to a **second browser window / incognito tab** (pre-set up off-camera). Pastes the link.
7. Public endorsement page loads. Presenter plays the endorser role: types "Samira Patel", "Former manager at Acme", one sentence message.
8. Submits. "Thank you" page appears.
9. Back to first browser. Wallet polls; within ~3 seconds the new `SELF_REPORTED` endorsement badge appears on the grid.
10. Click the badge. Modal shows endorser name, relationship, quoted message. Tier chip visually ranks below the other two badges.
11. **Money shot**: all three badges visible at once — `SOURCE_CONFIRMED` Argyle at top, `REVIEWED` document upload in the middle, `SELF_REPORTED` endorsement at the bottom. The tier ladder is the entire product thesis in one screen.

Rehearsal-only (off-camera):
- Expired token: manually fast-forward a request's `expires_at`, try to submit, assert 410 with the friendly expired page
- Double-submit: submit once, then submit again with the same token, assert the second call returns "already submitted"
- Invalid JWT: hand-crafted bad token, assert 401
- Missing fields: submit with empty message, assert the page re-renders with a clear error and preserves the other fields
- Verbose endorser input (very long message, unicode, HTML tags): assert stored safely, rendered escaped
- Public page unreachable Career-AI user lookup: assert fallback display name is used and flow still works

Automated (vitest, stretch):
- Unit: JWT generation + verification round-trip
- Unit: status transition `pending → submitted` is atomic under concurrent submits (optimistic lock or unique-index enforcement)
- Integration: fire a full request + submit loop against a running endorsement-service + stubbed issuer-service, assert a credential is issued with the right shape

## Open questions

1. **Does the demo include email delivery?** The spec defaults to console-log + copy/paste because email-on-stream is unreliable (deliverability, spam folders, rehearsal fragility). But it's a weaker story. Lean: console-log for demo, post-demo ticket adds Resend or Postmark.
2. **Endorser-supplied employer / role: use user's claim or let the endorser enter?** If the user has an existing `EmploymentCredential` for Acme, the request should pre-fill "Acme Corp / Senior Engineer". The endorser sees that context but doesn't edit it. Lean: yes, pre-fill and lock.
3. **How visible is the `SELF_REPORTED` label?** The label needs to be *visible without being demeaning*. The wallet UI has to clearly rank endorsements below structured verification without making the user feel the endorsement is worthless. Copy: "Peer vouch — self-reported by endorser" vs. "Lowest trust" — lean towards the former.
4. **Cross-origin considerations**: endorsement-service serves HTML at a different origin from Career-AI. Browsers don't care (no cross-origin cookies, no CORS for a public GET), but the mental model needs to be correct. Not a blocker.
5. **Endorser copy-paste attack vector**: if the presenter leaks the magic URL on stream (even in a screenshot), someone in the audience could submit a fake endorsement before the "endorser" does. Mitigation: short expiry (1 hour for demo), or generate the link right before the endorsement step during the rehearsed sequence so the exposure window is seconds. Decision before rehearsal.
6. **Display name lookup for the public page**: this requires endorsement-service to call Career-AI for a user's display name by DID. That's a new reverse dependency (backend → frontend). Alternative: include the display name in the `POST /v1/endorsements/request` body (Career-AI already has it in session). Lean: include it in the request body, avoid the reverse call.

## Migration / rollout

- New service, no existing contracts to break.
- New Postgres schema `endorsement`. Shares the existing api-gateway DB.
- New env vars on endorsement-service:
  - `ENDORSEMENT_TOKEN_SECRET` — HS256 secret for magic JWTs
  - `ENDORSEMENT_PUBLIC_BASE_URL` — base URL for magic links (dev: `http://localhost:8093`; demo: real host)
  - `ISSUER_SERVICE_URL` — reuse from `001`
  - `INTERNAL_SHARED_SECRET` — reuse from `001`
  - `CAREER_AI_DISPLAY_NAME_URL` — only needed if the public page calls back to Career-AI for display names; skip if we embed it in the request body (see open question 6)
- New env var on Career-AI:
  - `CAREER_LEDGER_ENDORSEMENT_URL=http://localhost:8093` — used to render magic URLs in the success card
- New VC schema at `https://schemas.career-ledger.example/endorsement/v1` — hosted inline on issuer-service at `/schemas/endorsement/v1.json` (same approach as spec `001` open question 5 suggests for employment)
- Runbook entry: `cd career-ledger/services/endorsement-service && npm run dev   # :8093` added after implementation
- Demo-stub markers:
  - `// DEMO STUB: magic link logged to console, replace with email delivery`
  - `// DEMO STUB: endorser identity is self-claimed, no DID binding`
- Post-demo follow-up tickets:
  - Real email delivery (Resend or Postmark)
  - Endorser sign-in flow — bind endorser to a DID, promote tier
  - Rate limit the public submission endpoint
  - Collusion detection graph signals (T6 in the original plan — big project, not a quick follow-up)
