# Career Ledger

Private backend monorepo for the Career Ledger platform. Sibling to [`Career-AI`](../Career-AI) (the frontend) and hosts the business logic, services, and the nested `protocol/` subtree that will become the open-source [`career-protocol`](#open-source-split-out) repo.

## Layout

```
career-ledger/
├── protocol/          ← nested open-source subtree — splits out as career-protocol repo
│   ├── spec/          ← the protocol specification document
│   └── packages/      ← @career-protocol/* open-source libraries
├── packages/          ← private business logic (the moat)
├── services/          ← private backend services
├── infra/             ← shared infra primitives (kms, events, db)
└── docs/              ← architecture, threat model, open questions
```

## Open-source split-out

The `protocol/` folder is structured as a self-contained subtree that can be split out into a standalone public repo at any time via:

```bash
git subtree split --prefix=protocol -b career-protocol-main
```

**Split-readiness rules (enforced from day 1)**:

1. Every package under `protocol/packages/*` publishes under the npm scope `@career-protocol/*`
2. `protocol/**` must NEVER import from `packages/**` or `services/**`
3. Consumers import protocol code only via `@career-protocol/*` scoped names, never relative paths like `../../protocol/...`
4. `protocol/` has its own `package.json`, tsconfig, license, README, CI
5. Private code can depend on protocol types; protocol code can never depend on private types

See [`docs/architecture.md`](./docs/architecture.md) for the full design and [`../../.claude/plans/graceful-juggling-pie.md`](../../.claude/plans/graceful-juggling-pie.md) for the roadmap.

## Status

**Phase T0** — Foundation and contracts. See [`docs/open-questions.md`](./docs/open-questions.md) for what's still being decided.

## Relationship to Career-AI

Career-AI is the user-facing Next.js frontend. Career Ledger is the backend it will connect to. See [`docs/architecture.md`](./docs/architecture.md) for the integration boundary.
