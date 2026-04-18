# @career-protocol/chain-client

**Status**: Deferred to Phase T8. This package is a placeholder so consumers have a stable import path the day we enable chain anchoring. No implementation yet.

## When live

Provides a read-only client for the on-chain credential registry. Any verifier can use it to check:

- whether a given `vcHash` exists on chain
- the credential's status (active / revoked / superseded)
- the issuer DID and issuance timestamp
- the owner's DID hash (never the DID itself — on-chain data has no PII)

## Privacy guarantees (when live)

- **No PII on chain, ever** — not raw, not encrypted. Only one-way hashes and non-PII metadata.
- **Owner is a salted hash of the DID**, not the DID itself. Even scraping every transaction yields no user identity.
- **Legal review required** before first deployment.

## Stub interface

```ts
export interface ChainClient {
  lookup(vcHash: string): Promise<OnChainCredentialRecord | null>;
}

export interface OnChainCredentialRecord {
  vcHash: string;
  badgeType: string;
  issuerDid: string;
  ownerDidHash: string;
  schemaId: string;
  issuedAt: number;
  status: 'ACTIVE' | 'REVOKED' | 'SUPERSEDED';
}
```
