# @career-protocol/did-resolver

DID resolution for the Career Protocol. Exposes a pluggable resolver interface so consumers can resolve DIDs to DID documents regardless of method.

## Supported methods (initial)

- `did:web` — platform issuer (hosted at `career-ledger.example/.well-known/did.json`)
- `did:key` — holder DIDs (portable, no infra)

## Planned methods

- `did:ethr` — if/when Phase T8 introduces chain-native ownership
- `did:pkh` — optional for crypto-wallet-style holders

## Interface

```ts
export interface Resolver {
  resolve(did: string): Promise<DidDocument>;
}
```

Consumers inject the resolver into `@career-protocol/vc-toolkit` for verification.
