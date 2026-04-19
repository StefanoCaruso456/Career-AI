# api-gateway

Public HTTP gateway for Career Ledger. The **only** service Career-AI talks to.

Owns: inbound auth, request validation, orchestration of internal service calls, database reads and writes, outbound response normalization, and audit logging. Internal services (`document-verifier`, `issuer-service`, `wallet-service`, etc.) are never exposed directly to the frontend.

Pairs with `a2a-gateway` (DID-authenticated external agent traffic). Both are public boundaries; everything else is internal.

## Why this exists

If Career-AI called internal services directly we would:

- leak internal service topology to the frontend (every service rename becomes a React refactor)
- scatter business logic across frontend, services, and glue code
- repeat auth, audit, rate limiting, validation in every service
- lose the ability to version the public API separately from internal implementation
- have no single place to strip PII from responses or enforce trust policies

So all user-facing traffic goes through this gateway.

## API (demo scope)

### `POST /v1/claims/employment`

Submit an employment claim plus supporting PDF for verification.

**Headers**

```
Authorization: Bearer <GATEWAY_SHARED_SECRET>
X-Actor-Did:   <DID of the logged-in Career-AI user>
```

`X-Actor-Did` is caller-asserted for the demo — the shared secret is the trust
boundary, so the gateway trusts Career-AI to report the correct logged-in
user. When identity-service lands, the Authorization header will carry a
signed session token and the DID will be derived server-side.

**Body** (`multipart/form-data`)

| Field | Type | Notes |
|---|---|---|
| `file` | PDF | Offer letter or employment document |
| `claim` | JSON string | `{ "employer": "...", "role": "...", "startDate": "YYYY-MM-DD", "endDate"?: "YYYY-MM-DD" }` |

**Response**

```json
{
  "claimId": "9f3c0d2e-...",
  "status": "PARTIAL",
  "confidenceTier": "EVIDENCE_SUBMITTED",
  "displayStatus": "Evidence submitted",
  "matches": {
    "employer": true,
    "role": true,
    "dates": true
  },
  "authenticitySource": "unsigned",
  "verifiedAt": "2026-04-13T14:22:00Z"
}
```

When the verdict is `VERIFIED`, the response additionally carries
`badgeId` — a pointer into the `badges` table. Pre-W3C this is just a
minimal credential record scoped to the subject DID; once signed W3C VCs
land, the stored payload becomes the signed credential and the ID and
ownership stay the same.

Note the normalization: the frontend gets a flat, display-ready envelope. Raw signals, envelope IDs, reviewer notes, and other internal shapes stay on the server side.

### `GET /v1/claims`

Lists the authenticated actor's claims, most recent first, each with its
latest verification summary. Scoped server-side to the `X-Actor-Did` header
— there is no way to read another user's claims through this endpoint.

```json
{
  "claims": [
    {
      "claimId": "9f3c0d2e-...",
      "claimType": "employment",
      "status": "VERIFIED",
      "confidenceTier": "REVIEWED",
      "displayStatus": "Verified",
      "payload": { "employer": "...", "role": "...", "startDate": "..." },
      "createdAt": "2026-04-13T14:22:00Z",
      "updatedAt": "2026-04-13T14:22:00Z",
      "verification": {
        "verifiedAt": "2026-04-13T14:22:00Z",
        "authenticitySource": "docusign",
        "matches": { "employer": true, "role": true, "dates": true, "isOfferLetter": true }
      }
    }
  ]
}
```

### `GET /v1/claims/:id`

Returns one claim + latest verification, scoped to the authenticated actor.
Returns 404 (not 403) when the claim exists but is owned by a different DID,
so ownership is not revealed to unrelated callers.

### `GET /v1/health`

Basic service health. Unauthenticated. Returns `{status, service, version}`.

### `GET /v1/health/deep`

Deep health check — verifies DB connectivity and downstream service reachability. Returns 503 if anything is down. Unauthenticated.

## Running locally

**1. Start Postgres**

```bash
cd services/api-gateway
docker compose up -d postgres
```

Postgres runs on port `5433` (chosen to avoid clashing with any local Postgres on `5432`).

**2. Configure**

```bash
cp .env.example .env
# Review the shared secret and change if needed
```

**3. Run migrations**

```bash
npm run db:migrate
```

This creates the `claims`, `verifications`, `badges`, and `audit_events` tables.

**4. Start document-verifier in one terminal**

```bash
cd ../document-verifier
npm run dev
```

**5. Start api-gateway in another terminal**

```bash
cd services/api-gateway
npm run dev
```

Gateway listens on `http://localhost:8080`.

## Smoke test

Generate a fixture and submit through the gateway:

```bash
# Generate a sample offer letter
cd ../document-verifier
npm run generate:fixture

# Submit via the gateway
curl -X POST http://localhost:8080/v1/claims/employment \
  -H "Authorization: Bearer dev-career-ai-secret-change-me" \
  -H "X-Actor-Did: did:web:career-ai.example/users/demo-user-1" \
  -F "file=@test/fixtures/sample-offer-letter.pdf" \
  -F 'claim={"employer":"Acme Corp","role":"Senior Engineer","startDate":"2022-03-01"}'
```

Expected response: `PARTIAL` verdict, `EVIDENCE_SUBMITTED` tier, all three `matches.*` fields true, `authenticitySource: "unsigned"`.

## Architecture

```
Career-AI (Next.js)
   │
   │  POST /v1/claims/employment + Bearer token
   ▼
┌─────────────────────────────────────────────┐
│ api-gateway                                  │
│                                              │
│  middleware/                                 │
│   ├── audit.ts        (before everything)    │
│   └── auth.ts         (shared secret check)  │
│                                              │
│  routes/                                     │
│   └── claims.ts       (thin adapter)         │
│                                              │
│  orchestrators/                              │
│   └── employment-claim.ts  ◀── business flow │
│          │                                    │
│          ├── INSERT claim (status=PENDING)    │
│          │                                    │
│          ├── clients/document-verifier.ts ───┼──▶ document-verifier
│          │                                    │
│          ├── INSERT verification              │
│          ├── UPDATE claim status              │
│          │                                    │
│          └── normalize → public response      │
│                                                │
│  db/                                           │
│   ├── schema.ts        (drizzle)               │
│   ├── claims                                   │
│   ├── verifications                            │
│   └── audit_events                             │
└────────────────────────────────────────────────┘
```

## Design rules

1. **Route handlers stay thin**. They parse and validate; orchestrators do the work.
2. **Orchestrators are pure business logic**. No HTTP parsing, no Hono imports — just DB and clients.
3. **Clients are typed HTTP wrappers**. Never expose raw `fetch` calls to orchestrators.
4. **The response shape returned to Career-AI is a separate type** from the internal verification response. Normalization is explicit, not "whatever the service returned."
5. **Audit logging is never optional** for authenticated routes.
6. **No PII in audit logs**. Only metadata (method, path, status, duration, correlation ID, actor DID).
7. **Never mutate verification rows**. Each attempt is appended; the claim's status is derived from the latest.

## Known TODOs

- Real session auth via identity-service (replaces shared secret + X-Actor-Did)
- Rate limiting (per-actor-DID token bucket)
- Issuer-service handoff when verdict is `VERIFIED` (mint a VC from the claim)
- OpenAPI spec export
- Structured event emission to `infra/events` for downstream subscribers
