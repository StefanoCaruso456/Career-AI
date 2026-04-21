# api-gateway

`api-gateway` is an optional Hono service in this repo. The main Next.js app can call it from `lib/api-gateway/client.ts` during Career Builder evidence verification.

## Current Surface

- `GET /v1/health`
- `GET /v1/health/deep`
- `POST /v1/claims/:kind`

Implemented claim kinds live in `src/claim-types/`:

- `offer-letter`
- `employment-verification`
- `employment-identity`
- `education`
- `transcript`

## What It Does

- validates a shared-secret boundary
- accepts multipart PDF uploads plus a JSON claim payload
- calls `pdf-extractor`
- runs in-process verification logic
- stores claim, verification, badge, and audit records in its own Postgres schema
- returns a normalized verification response

## How The Next.js App Uses It

- Caller: `app/api/v1/career-builder/phases/[phase]/route.ts`
- Client wrapper: `lib/api-gateway/client.ts`
- If `API_GATEWAY_URL` or `GATEWAY_SHARED_SECRET` is missing, the Next.js app skips the verification call instead of failing the save.

## Local Run

```bash
npm --workspace services/api-gateway install
npm --workspace services/api-gateway run db:migrate
npm --workspace services/api-gateway run dev
```

The service listens on port `8080` by default.
