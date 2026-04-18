# 003-sync-service-argyle

**Status**: Draft
**Owner**: fsyed
**Related**: depends on [`001-issuer-wallet-mvp.md`](./001-issuer-wallet-mvp.md) and [`002-career-ai-wallet-ui.md`](./002-career-ai-wallet-ui.md). Delivers demo priority item 5 (third-party authoritative source for employment verification). Plan phase T4 pulled forward for demo.

## Problem

Items 1–4 deliver the user-upload path — the user proves employment by submitting a document. The ceiling on that path is `REVIEWED` because even a cryptographically valid PKCS#7 signature only proves DocuSign stamped the envelope, not that the named employer actually signed it (see `feedback_pkcs7_does_not_prove_sender.md`). The product thesis requires a higher-trust path: data coming **directly from the employer's payroll system** via a consumer-permissioned aggregator. The same job produces a `SOURCE_CONFIRMED` badge instead of `REVIEWED`, and the demo shows the tier bump side-by-side. For the streamed demo we need one real integration, not a stubbed one — an engineer in the audience will open devtools.

## Scope

**In**
- New `sync-service` (Hono, :8092) hosting a single `ArgyleAdapter`
- Real Argyle **sandbox** integration end-to-end: Link token provisioning, hosted Link flow opened from Career-AI, webhook receipt, full employment fetch, claim normalization
- Webhook receiver at `POST /v1/sync/webhook/argyle` with HMAC signature verification
- On `employments.added` webhook, sync-service calls `issuer-service` with `method: "payroll-sync"` and tier `SOURCE_CONFIRMED`, producing an `EmploymentCredential` VC that lands in the user's wallet via the same path as spec `001`
- Career-AI wallet UI gains a "Connect payroll for instant verification" button that launches Argyle Link and polls for the resulting badge
- A second badge card style for `SOURCE_CONFIRMED` tier that visually outranks `REVIEWED` (different color chip, small "Source: Argyle" label)
- Persisted connection record so we know which Argyle user corresponds to which `ownerDid`
- A pluggable `SyncAdapter` interface so Finch / Pinwheel / Work Number can drop in later without touching the webhook router

**Out**
- Adapters other than Argyle — one real integration is enough for the demo, and Argyle is the clean consumer-permissioned path
- Income / earnings data — employment only (`employer`, `role`, `start`, `end`). Argyle returns a lot more; we ignore the rest.
- Historical sync windows beyond what Argyle returns by default
- Encrypted-at-rest storage of Argyle account tokens — stored in Postgres as-is for demo, labeled as demo-only
- Scheduled re-sync — event-driven only (webhook)
- Background job queue — webhook processing is synchronous
- Deduplication across adapters — out of scope until there's more than one
- Handling Argyle `employments.updated` / `employments.deleted` — only `employments.added` is wired
- Argyle identity verification signal — out of scope; we trust Argyle's sandbox identity for demo
- Non-US employment — Argyle covers primarily US, matches demo plan

## Design

### Topology

```
Career-AI browser
    │  (Argyle Link JS SDK, loaded on /wallet)
    ├─► Argyle-hosted Link flow (user logs into their payroll)
    │       │
    │       ▼
    │   Argyle backend
    │       │  webhook: employments.added
    │       ▼
    │   sync-service :8092
    │       │  fetch full employment record via Argyle API
    │       ▼
    │   issuer-service :8090 (existing from 001)
    │       │  builds SOURCE_CONFIRMED EmploymentCredential, signs
    │       ▼
    │   wallet-service :8091
    │       │  encrypts, stores
    │       ▼
    └── Career-AI /wallet polls → sees new badge
```

Why direct sync-service → issuer-service instead of going through api-gateway: the api-gateway's orchestrator is for user-initiated upload claims. A webhook-triggered issuance is a different trigger with different auth (HMAC instead of shared secret). Routing it through the gateway would force the gateway to understand two unrelated flows. Simpler: sync-service holds its own trusted path to issuer-service via the existing internal shared secret.

### Link token flow

1. User on `/wallet` clicks **"Connect payroll for instant verification"**
2. Career-AI server route `POST /api/v1/ledger/sync/link` calls sync-service `POST /v1/sync/link` with the user's `boundDid`
3. sync-service calls Argyle's `POST /link-items` to create a user (if first time) + mint a Link token scoped to that user
4. Career-AI server returns `{ linkToken, argyleUserId }` to the browser
5. Browser opens Argyle Link with the token — Argyle handles payroll provider selection, login, MFA, scraping
6. Link completes; Argyle emits `users.connected` + `employments.added` webhooks
7. sync-service receives the webhook, looks up the user by `argyleUserId`, calls Argyle's `GET /employments?user=...` for the full record
8. Maps to `EmploymentClaim` shape and calls `issuer-service POST /v1/credentials/issue` with `method: "payroll-sync"` and tier `SOURCE_CONFIRMED`
9. Wallet page polls `GET /api/v1/wallet/credentials` (from spec `002`) until the new badge appears

### The SyncAdapter interface

```ts
interface SyncAdapter {
  name: "argyle" | "finch" | "pinwheel" | "worknumber";

  // Create the aggregator's user + return a link/connect token
  createLinkToken(ownerDid: string): Promise<{ linkToken: string; adapterUserId: string }>;

  // Verify HMAC / JWT on inbound webhook
  verifyWebhook(headers: Record<string, string>, rawBody: string): boolean;

  // Handle the verified payload; return a list of claims to issue
  handleWebhook(payload: unknown): Promise<SyncedEmploymentClaim[]>;
}

interface SyncedEmploymentClaim {
  ownerDid: string;
  employer: { name: string; domain?: string };
  role: string;
  employmentPeriod: { startDate: string; endDate: string | null };
  adapterEvidence: {
    adapter: string;
    adapterRecordId: string;   // the aggregator's employment row ID
    fetchedAt: string;
  };
}
```

One file per adapter. The webhook router dispatches on path prefix: `/v1/sync/webhook/argyle` → `argyleAdapter.verifyWebhook + handleWebhook`.

### Confidence tier policy

`SyncedEmploymentClaim` from a payroll adapter always issues at `SOURCE_CONFIRMED`. Rationale: the data flowed from the employer's own payroll system through an authenticated connection the user authorized. The only remaining trust gap is the adapter itself (Argyle is SOC 2 certified and has employer-direct ingestion agreements). Demo-visible tier cap — no further aggregation required.

When the user *also* uploads a document for the same job, the verdict aggregator in `document-verifier` will see both signals and issue a `MULTI_SOURCE_CONFIRMED` credential. That's a stretch goal — mentioned in open questions below but not in scope.

## Data model / API

### sync-service Postgres schema

New schema `sync` in the existing Postgres instance (port 5433):

```sql
CREATE SCHEMA IF NOT EXISTS sync;

CREATE TABLE sync.connections (
  id              UUID PRIMARY KEY,
  owner_did       TEXT NOT NULL,
  adapter         TEXT NOT NULL,               -- "argyle"
  adapter_user_id TEXT NOT NULL,
  access_token    TEXT NULL,                   -- Argyle user token, DEMO STUB: plaintext
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at  TIMESTAMPTZ NULL,
  UNIQUE (adapter, adapter_user_id)
);

CREATE INDEX idx_sync_connections_owner ON sync.connections(owner_did);

CREATE TABLE sync.events (
  id              UUID PRIMARY KEY,
  connection_id   UUID NOT NULL REFERENCES sync.connections(id),
  event_type      TEXT NOT NULL,               -- "employments.added", etc.
  raw_payload     JSONB NOT NULL,
  processed_at    TIMESTAMPTZ NULL,
  error           TEXT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### sync-service HTTP API (:8092)

- `POST /v1/sync/link`
  - Auth: internal shared secret (called by Career-AI proxy route only)
  - Body: `{ ownerDid: string }`
  - Response: `{ linkToken: string, adapterUserId: string, expiresAt: string }`
  - Side effect: creates `sync.connections` row with `access_token = null`

- `POST /v1/sync/webhook/argyle`
  - Auth: HMAC-SHA256 signature in `X-Argyle-Signature` header, verified against `ARGYLE_WEBHOOK_SECRET`
  - Body: Argyle's standard webhook payload
  - Side effect: logs event, dispatches to `argyleAdapter.handleWebhook`, calls issuer-service for each returned claim

- `GET /v1/sync/:ownerDid/connections`
  - Auth: internal shared secret
  - Response: list of `{ adapter, adapterUserId, linkedAt, lastSyncedAt }` — no tokens returned
  - Used by Career-AI wallet UI to show "Payroll connected via Argyle" status chip

- `GET /v1/health`

### Career-AI proxy routes

New server-only routes following the pattern from spec `002`:

- `POST /api/v1/ledger/sync/link`
  - Auth: `getServerSession()` → `boundDid`
  - Forwards to sync-service `POST /v1/sync/link`
  - Returns `{ linkToken }` to the browser (no secrets, no adapter user ID)

- `GET /api/v1/ledger/sync/status`
  - Forwards to sync-service `GET /v1/sync/:ownerDid/connections`
  - Used to render the "Connected via Argyle" chip on `/wallet`

### Career-AI frontend additions

1. **`/wallet` gets a new card** above the badge grid:
   - Empty state: "Connect your payroll for instant verification" + button
   - Linked state: "Connected via Argyle — last synced 2 minutes ago"

2. **Argyle Link script** loaded dynamically on click (not in the base bundle)

3. **Polling**: after Link completes successfully, the wallet page polls `GET /api/v1/wallet/credentials` every 2 seconds for 30 seconds, highlighting the new `SOURCE_CONFIRMED` badge when it appears. After 30 seconds without new badge, show a "Still processing… your badge will appear shortly" toast and stop polling.

### VC shape tweaks

The existing `EmploymentCredential` shape from `001` accommodates both upload-derived and sync-derived issuance via the `evidence` field:

```json
"evidence": [{
  "id": "urn:evidence:argyle-connection-<uuid>",
  "type": ["PayrollSyncEvidence"],
  "verificationMethod": "payroll-sync",
  "adapter": "argyle",
  "adapterRecordId": "emp_...",
  "fetchedAt": "2026-04-15T12:00:00Z"
}]
```

`credentialSubject.confidenceTier` = `"SOURCE_CONFIRMED"`. No PII from Argyle beyond what the user already claimed themselves.

## Test plan

Live rehearsal path (this is also the stream demo script for item 5):

1. Pre-demo: ensure Argyle sandbox account is provisioned. Pick one sandbox employer that's recognizable (Argyle sandbox ships with "Gusto Demo Employer" or similar) and rehearse with that.
2. User signs in, navigates to `/wallet`. Confirm the "Connect payroll" card shows the empty state.
3. Click **Connect payroll**. Argyle Link opens.
4. Select the sandbox employer, log in with sandbox credentials.
5. Link completes. Back on `/wallet`. Polling starts.
6. Within ~5 seconds, `SOURCE_CONFIRMED` `EmploymentCredential` appears in the badge grid. Highlighted.
7. Click the new badge. Preview modal shows the job details + "Source: Argyle (payroll-sync)" label + signed proof value.
8. **Side-by-side shot**: the same user's `REVIEWED` badge from item 1 sits next to the `SOURCE_CONFIRMED` one, visually ranked. This is the demo money shot.

Rehearsal-only (off-camera):
- HMAC webhook verification: send a forged webhook from curl, assert sync-service rejects with 401
- Duplicate webhook: send the same `employments.added` twice, assert only one VC is issued (dedupe key = `adapterRecordId`)
- Webhook-during-disconnection: shut down issuer-service, fire webhook, assert sync-service records the event with `error` set and does not crash
- Network to Argyle fails during `createLinkToken`: assert the proxy returns a clear user-facing error

Automated (vitest, stretch):
- Unit: Argyle webhook signature verification with known-good + forged inputs
- Unit: `mapArgyleEmploymentToClaim()` produces the correct `SyncedEmploymentClaim` shape from a fixture payload
- Integration: fire a mocked Argyle webhook at a running sync-service with in-memory issuer-service stub, assert an issue call with `tier: SOURCE_CONFIRMED`

## Open questions

1. **Argyle sandbox account ownership**: whose email do we register sandbox access under? The Argyle portal ties the sandbox to a real person's email. Lean: register under the demo Google account so it's recoverable, not a personal account.
2. **Argyle Link branding**: Link is white-labeled, but for the sandbox the hosted page may show "Argyle Demo". Stream-safe? Lean: yes, and narration calls it out as "the payroll aggregator". Verify in rehearsal.
3. **Webhook delivery on a local dev host**: Argyle sandbox webhooks need a public URL. Use a tunneling tool (ngrok / cloudflared) for dev, but a real deployment for the demo. Decision deadline: ~1 week before stream. If the demo is hosted (not localhost), this becomes trivial.
4. **Polling vs. realtime push**: 2-second polling is a demo shortcut. A WebSocket / SSE channel from wallet-service is the right answer long-term. Lean: polling for demo, mark as post-demo tech debt.
5. **When upload + sync produce the same job — dedup logic**: should we merge into one badge at `MULTI_SOURCE_CONFIRMED` or show two separate badges? The plan says MULTI_SOURCE_CONFIRMED is the right answer, but implementing the dedup key ("same employer + overlapping dates = same job") is its own small project. Lean: show two badges for demo, add a follow-up spec for merging.
6. **Argyle user deletion**: if the user disconnects, do we revoke the existing VC? Lean: no — the VC was true at the time of issuance, revocation is a separate concern (StatusList2021, deferred from `001`).
7. **Argyle employers that don't match any known domain**: Argyle returns a free-form employer name. We don't verify it against an employer registry (out of scope). The `credentialSubject.employer.domain` field will be `null` for demo. Stream-safe; don't over-explain.

## Migration / rollout

- New service. No existing contracts to break.
- New Postgres schema `sync`. Shares the existing api-gateway DB for simplicity.
- New env vars on sync-service:
  - `ARGYLE_API_KEY` — sandbox key, rotated post-demo
  - `ARGYLE_API_SECRET`
  - `ARGYLE_WEBHOOK_SECRET` — HMAC verification
  - `ARGYLE_BASE_URL` — `https://api-sandbox.argyle.com`
  - `ISSUER_SERVICE_URL` — reuse from `001`
  - `INTERNAL_SHARED_SECRET` — reuse from `001`
- New env var on Career-AI:
  - `ARGYLE_LINK_ENVIRONMENT=sandbox` — the Argyle Link JS SDK picks this up
- Runbook entry: `cd career-ledger/services/sync-service && npm run dev   # :8092` added to the project_services_built memory after implementation
- Demo-stub markers: `// DEMO STUB: plaintext access token, rotate to encrypted at rest` on the `access_token` column use sites
- Post-demo follow-up tickets:
  - Encrypt `sync.connections.access_token` at rest
  - Add `employments.updated` and `employments.deleted` handlers
  - Merge duplicate badges into `MULTI_SOURCE_CONFIRMED`
  - Swap polling for SSE
