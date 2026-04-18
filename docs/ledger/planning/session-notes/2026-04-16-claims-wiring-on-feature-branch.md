# 2026-04-16 — Career-AI doc-validation wiring built, staged on a branch, not committed

**TL;DR**: A working `/claims/new` page in Career-AI is wired to the career-ledger gateway end-to-end. It compiles, the gateway returns real verdicts, and everything lives on the local branch `feat/ledger-claim-form` in the Career-AI repo. The user paused before pushing. Future sessions: decide whether to push, salvage, or rebuild given the Career ID tab consolidation that landed in parallel.

## What got built (in Career-AI)

| File | Role |
|---|---|
| `app/api/v1/ledger/claims/employment/route.ts` | Next.js proxy route. Auth via `resolveVerifiedActor`. Forwards multipart upload to gateway with shared-secret header. Maps `LedgerClientError` codes onto Career-AI's `ErrorCode` enum. |
| `app/claims/new/page.tsx` | Server-rendered page wrapper. Auth-gated via `getPersonaSignInRoute("/claims/new")`. |
| `components/ledger/new-employment-claim-form.tsx` | Client form. Employer + role + dates + `FileUploadDropzone` + optional CoC dropzone behind a disclosure. Renders verdict card (tier chip, match breakdown, detail rows). |
| `components/ledger/new-claim.module.css` | Matches Career-AI dark theme using `--bg-canvas`, `--panel`, `--accent` tokens. |
| `lib/ledger/client.ts` | `import "server-only"` typed client. `submitEmploymentClaim()` returns `LedgerClaimVerificationResponse` or throws `LedgerClientError(status, code, message, details)`. |
| `lib/ledger/config.ts` | `getCareerLedgerConfig()` reads `CAREER_LEDGER_GATEWAY_URL` + `CAREER_LEDGER_GATEWAY_SECRET` from env. |
| `packages/contracts/src/ledger.ts` | Zod schemas: `ledgerEmploymentClaimSchema`, `ledgerClaimVerificationResponseSchema`, `ledgerClaimErrorResponseSchema`. |
| `packages/contracts/src/index.ts` | Adds `export * from "./ledger"`. |
| `.env.example` | Adds `CAREER_LEDGER_GATEWAY_URL` + `CAREER_LEDGER_GATEWAY_SECRET`. |

Total: 8 new/modified files, +1126 lines.

## What got changed in career-ledger services (already committed-worthy, but check before committing)

The `dev` script in three services was updated from `tsx watch src/index.ts` to `tsx watch --env-file=.env src/index.ts`:

- `services/api-gateway/package.json`
- `services/document-verifier/package.json`
- `services/pdf-extractor/package.json`

This requires each service to have a `.env` file (gitignored). All three were created from `.env.example` in this session. Without this change, env vars like `GATEWAY_SHARED_SECRET` are undefined at runtime — the gateway will reject everything with 401 even when the request is correct.

These three `package.json` edits are **not yet committed** on either repo. They live in the working tree of the career-ledger repo and should be committed in a small follow-up (or together with whatever next implementation step lands).

## What was verified end-to-end

- All three career-ledger services run cleanly: api-gateway :8080, document-verifier :8787, pdf-extractor :8788.
- Direct gateway smoke test on `services/document-verifier/test/fixtures/sample-offer-letter.pdf`:
  - Returned `{status: "PARTIAL", confidenceTier: "EVIDENCE_SUBMITTED", matches: {employer:true, role:true, dates:true}, authenticitySource: "unsigned", verifiedAt: "..."}`.
- Career-AI typecheck passes for new ledger files. The 5 pre-existing errors (`agent-runtime`, `audit-security`, `homepage-assistant` test files) are unrelated, unchanged by this work.
- Career-AI dev server boots clean on Turbopack with the new code.
- `GET /claims/new` (unauthenticated) → 307 redirect to sign-in (expected).
- `POST /api/v1/ledger/claims/employment` (unauthenticated) → 401 with Career-AI's standard `{error_code, message, details, correlation_id}` envelope (proves route compiled, auth middleware ran, ledger client module loaded).

The only thing not validated is the authenticated browser flow, because Career-AI needs the user's local DATABASE_URL + auth secret to actually log in.

## The branch / git situation

**Branch**: `feat/ledger-claim-form` in Career-AI, created off `main` BEFORE pulling Stefano's 14 commits, then fast-forwarded with `git pull origin main`. HEAD is now at `a230407 Merge pull request #423 from StefanoCaruso456/codex/career-id-persona-status-sync`.

**Conflict resolved during stash pop**: `.env.example`. Stefano added `AUTONOMOUS_APPLY_*` and `LANGSMITH_API_KEY`. This branch added `CAREER_LEDGER_*`. Resolution kept both blocks.

**Migration collision avoided**: Local user WIP had `db/migrations/0012_career_evidence_role.sql`. Stefano's incoming had `db/migrations/0012_autonomous_apply_trace_integrity.sql` (same prefix, different file). Renamed the user's WIP file to `0013_career_evidence_role.sql`. Still untracked; not part of this commit.

**Backup stash**: `stash@{0}` titled `pre-ledger-push backup: all local WIP` / `ledger work + non-ledger WIP`. Holds the original local state (including unstaged career-builder + career-id-domain WIP). Drop only after the branch is confirmed good.

**What's NOT staged on this branch (intentionally — user's WIP, separate work)**:
- `components/agent-builder-workspace.tsx` + `.test.tsx`
- `next-env.d.ts` (auto-generated)
- `packages/career-builder-domain/{service.ts, service.test.ts}`
- `packages/career-id-domain/src/service.test.ts` (auto-merged successfully against Stefano's incoming changes)
- `packages/contracts/src/career-builder.ts`
- `packages/persistence/src/career-builder-repository.ts`
- `packages/recruiter-read-model/{candidate-search.test, candidate-trace.test, demo-dataset}.ts`
- `db/migrations/0013_career_evidence_role.sql` (career-builder evidence column)

## How this collides with the Career ID tab consolidation

In parallel, the team decided the offer letter form belongs **inside the Career ID tab** as a "Document-backed → Offer letters" card, not as a standalone `/claims/new` route. See:

- Memory: [`project_career_ai_wallet_into_career_id.md`](../../../../../.claude/projects/-Users-fsyed-Documents-capstone/memory/project_career_ai_wallet_into_career_id.md)
- Memory: [`project_offer_letter_upload_flow.md`](../../../../../.claude/projects/-Users-fsyed-Documents-capstone/memory/project_offer_letter_upload_flow.md)
- Spec: [`002-career-ai-wallet-ui.md`](../specs/002-career-ai-wallet-ui.md) (Flow update section at the top, dated 2026-04-16)

The new flow expands the form fields:
1. **Issuer** (employer name / org)
2. **Issued date**
3. **Validation context** (drives extraction matching)
4. **Why this should matter** (free-text, soul.md style — new `userNarrative` field)
5. **Final attachment** (the document)

This makes the standalone `/claims/new` page partially obsolete UI-wise. The backend pieces (proxy route, client, contracts, env vars) are fully reusable — the new Career ID card just imports from `lib/ledger/client.ts` and posts the same multipart payload.

**Backend gap to close**: `userNarrative` doesn't exist anywhere yet. To support the new flow:
- Add `userNarrative` (or `personalContext`) to `ledgerEmploymentClaimSchema` in `packages/contracts/src/ledger.ts`
- Add it to gateway's `employmentClaimSchema` in `services/api-gateway/src/routes/claims.ts`
- Add nullable `user_narrative` column to api-gateway's `claims` table via a new Drizzle migration
- Persist it on the claim row; it's not used by validation logic yet, but should be threaded into the eventual VC's `credentialSubject.context` or `evidence.userNarrative` field at issuance time (T2)

## Next implementation steps (when ready)

In rough priority order:

1. **Decide on the branch**:
   - Option A — push `feat/ledger-claim-form` as-is and open a PR. The standalone `/claims/new` page becomes either a dev/admin path or gets removed in a follow-up.
   - Option B — cherry-pick or copy the backend files (proxy route, lib/ledger/, contracts, .env.example) onto a new branch named after the Career ID work, skip the standalone page + form.
   - Both work. Option A is simpler if you want a working test path while building the Career ID tab card.

2. **Commit the career-ledger service script change** — add `--env-file=.env` to the `dev` script in api-gateway, document-verifier, pdf-extractor `package.json`. Small, harmless, makes future onboarding cleaner.

3. **Build the Career ID tab "Offer letters" card** — see spec [`002-career-ai-wallet-ui.md`](../specs/002-career-ai-wallet-ui.md) Flow update section. Reuse `lib/ledger/client.ts` and `packages/contracts/src/ledger.ts`. Render the result inline beneath the form, no navigation away. Wire the resulting badge into Stefano's existing Career ID badges rail.

4. **Add `userNarrative` field**:
   - Career-AI: extend the form, plumb through the proxy route
   - career-ledger contracts + gateway schema: accept the new optional field
   - api-gateway: persist on `claims.user_narrative` column (new migration)

5. **Then proceed with spec 005 (compressed Option A)** — issuer-service + wallet-service + identity-service. This is where actual W3C VC issuance happens; until that lands, the verification flow returns a verdict but no badge is minted.

6. **Then specs 003 + 004** — sync-service (Argyle) and endorsement-service for the streamed demo's three trust paths.

## Open questions worth flagging

- **Should the standalone `/claims/new` page be retained as a dev/admin path?** It's a useful "raw" path for testing the verification pipeline without going through the Career ID UI. Could live as `/dev/claims/new` or behind an admin check. Keep or delete is a small decision but worth making explicit.
- **Where does `userNarrative` go in the eventual VC?** Suggested: `credentialSubject.context` or `evidence[0].userNarrative`. Spec 005 may already address this.
- **The career-ledger services' `package.json` dev-script change isn't committed anywhere yet** — currently sits in the working tree. Worth a small standalone commit before things get more tangled.

## Repo state at session end

- Career-AI: branch `feat/ledger-claim-form` checked out, 8 files staged, ~12 unstaged files (your WIP), backup stash at `stash@{0}`.
- career-ledger: working tree has 3 modified `package.json` files (dev script change) + 3 new `.env` files (gitignored). Branch `main`. Not committed.
- capstone manifest: clean, no work in progress.

## See also

- [`docs/planning/specs/001-issuer-wallet-mvp.md`](../specs/001-issuer-wallet-mvp.md) — issuer + wallet design
- [`docs/planning/specs/002-career-ai-wallet-ui.md`](../specs/002-career-ai-wallet-ui.md) — original frontend spec + Flow update reflecting Career ID consolidation
- [`docs/planning/specs/005-compressed-option-a-w3c-vcs.md`](../specs/005-compressed-option-a-w3c-vcs.md) — 3-week compressed implementation plan
- [`docs/planning-workflow.md`](../../planning-workflow.md) — process overview
- [`docs/feature-tracker.md`](../../feature-tracker.md) — high-level status
