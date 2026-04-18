# infra/ — Shared infrastructure primitives

Cross-cutting infrastructure used by multiple services. Kept private.

## Contents

- [`kms/`](./kms) — Key management wrappers (AWS KMS or CloudHSM). Used by `issuer-service` (issuer signing keys), `wallet-service` (per-user encryption keys wrapped by passkey), and `identity-service` (DID key material).
- [`events/`](./events) — Internal event bus contracts. Strongly-typed events shared across services. Career-AI subscribes to a subset via webhook delivery.
- [`db/`](./db) — Shared persistence primitives (connection pools, migration runner conventions, base repositories). Services own their own schemas; this package holds only shared utilities.

## Status

Phase T0 — skeletons only. Implementations follow as services come online.
