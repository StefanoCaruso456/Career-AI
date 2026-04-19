# Career Ledger — Architecture

**Status**: Draft · Phase T0

## System boundary map

```
┌───────────────────────────────────────────────────────────────┐
│                     Career-AI (frontend)                       │
│                                                                 │
│  Next.js 16 app — candidate dashboard, admin review, recruiter │
│  views, existing PRD-driven UI. Owns session auth (Google      │
│  OAuth), artifact upload UI, Soul Record display.              │
└──────────────────────────┬────────────────────────────────────┘
                           │  HTTPS + events
                           ▼
┌───────────────────────────────────────────────────────────────┐
│                      career-ledger (backend)                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  protocol/  (future career-protocol repo)                │  │
│  │  ─────────                                                │  │
│  │  @career-protocol/badge-schemas                          │  │
│  │  @career-protocol/vc-toolkit                             │  │
│  │  @career-protocol/a2a-protocol                           │  │
│  │  @career-protocol/did-resolver                           │  │
│  │  @career-protocol/sync-adapter-sdk                       │  │
│  │  @career-protocol/chain-client  [T8]                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  packages/  (private business logic — the moat)          │  │
│  │  reputation-engine · matching-engine · agent-personas ·  │  │
│  │  negotiation-policy · collusion-detection · admin-ops    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  services/  (private backend services)                   │  │
│  │  identity · issuer · wallet · verification-orchestrator  │  │
│  │  endorsement · sync · candidate-agent · employer-agent   │  │
│  │  a2a-gateway · status                                    │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## Canonical issuance flow

See [`../../.claude/plans/graceful-juggling-pie.md`](../../../.claude/plans/graceful-juggling-pie.md) §"End-to-end issuance flow" for the full eight-step walkthrough.

Summary:

1. User submits claim + evidence via Career-AI
2. Career-AI `artifact-domain` stores file, parser extracts fields
3. Verification (method varies): human review, employer agent, payroll sync, or rules → emits `verification.review.approved`
4. `issuer-service` builds VC, signs with KMS key, computes `vcHash`, encrypts with user wallet key, stores in `wallet-service`, emits `credential.issued`
5. `artifact-domain` subscribes to `credential.issued`, verifies hash match, deletes raw artifact bytes (verify-and-forget)
6. User sees badge in wallet UI (passkey-unlocked preview)
7. User shares SD-JWT-VC presentation with recruiter
8. **[T8]** Issuance hook writes `vcHash + metadata` to on-chain registry

## Integration boundary with Career-AI

- **Career-AI owns**: UI, session auth, artifact upload UX, Soul Record presentation, admin review queue, recruiter read model
- **career-ledger owns**: DID issuance, VC signing, wallet storage + encryption, agent runtime, A2A gateway, reputation + matching, status lists
- **Shared event contracts**: Career-AI emits `verification.review.approved`; career-ledger emits `credential.issued`, `credential.revoked`, `presentation.requested`

## Split-readiness

The `protocol/` folder is structured so that `git subtree split --prefix=protocol` yields a complete, standalone, buildable repo ready to publish as `career-protocol`. See [`../README.md`](../README.md) for the rules.

## Phase T0 deliverables

- [ ] `protocol/spec/overview.md` — done (draft)
- [ ] `protocol/spec/credentials.md`
- [ ] `protocol/spec/badges.md` — badge type taxonomy
- [ ] `protocol/spec/identity.md` — DID method decision
- [ ] `protocol/spec/a2a.md` — A2A message schema draft
- [ ] `protocol/packages/badge-schemas` — Identity + Employment v1 schemas
- [ ] `protocol/packages/vc-toolkit` — issue + verify + sign reference impl
- [ ] `protocol/packages/did-resolver` — resolver interface + did:web impl
- [ ] `threat-model.md` — initial draft
- [ ] `open-questions.md` — unresolved T0 decisions
- [ ] CI: lint-boundaries rule enforcing protocol ⇎ private import discipline
