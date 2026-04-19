# @career-protocol/sync-adapter-sdk

Base SDK for building payroll and HRIS data sync adapters. Adapters pull raw employment data from providers (ADP, Argyle, Pinwheel, Workday, etc.) and normalize it into Career Protocol claim payloads that `issuer-service` can turn into Verifiable Credentials.

## Contract

Every adapter implements:

```ts
export interface SyncAdapter {
  readonly providerId: string;
  readonly name: string;

  connect(userId: string, authPayload: unknown): Promise<ConnectionHandle>;
  fetchEmploymentHistory(handle: ConnectionHandle): Promise<NormalizedEmploymentClaim[]>;
  disconnect(handle: ConnectionHandle): Promise<void>;
}
```

## Privacy posture

- Raw provider data is held in memory only during normalization, never persisted unencrypted
- Once normalized claims are handed to `issuer-service`, raw payloads are dropped
- Provider access tokens are short-lived and stored encrypted; revoked on disconnect
- Provenance metadata in each issued VC records which adapter issued it and when, but never the raw API response

## Adapters (initial targets, Phase T4)

- `@career-protocol/sync-adapter-adp` (TBD)
- `@career-protocol/sync-adapter-argyle` (TBD)
- `@career-protocol/sync-adapter-pinwheel` (TBD)
