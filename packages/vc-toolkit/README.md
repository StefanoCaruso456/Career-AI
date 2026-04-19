# @career-protocol/vc-toolkit

Reference implementation for issuing, signing, verifying, and presenting W3C Verifiable Credentials with SD-JWT-VC selective disclosure.

## Planned API

```ts
import { issue, verify, present, vcHash } from '@career-protocol/vc-toolkit';

// Issuer — construct and sign a VC
const signedVc = await issue({
  issuerDid,
  signingKey,
  subject: { id: holderDid, ... },
  schemaId: 'https://schemas.career-ledger.example/employment/v1',
  claim: { employer, role, employmentPeriod, ... },
  evidence: [...],
});

// Holder — generate a Verifiable Presentation (optionally with selective disclosure)
const vp = await present({
  credentials: [signedVc],
  holderDid,
  holderKey,
  verifierDid,
  discloseFields: ['employer.name', 'role'],  // omit 'employmentPeriod'
  nonce,
  audience: verifierDid,
});

// Verifier — verify issuer signature, holder signature, status, schema
const result = await verify(vp, {
  trustedIssuers: [careerLedgerIssuerDid],
  resolveSchema,
  resolveStatus,
});

// Content hash for chain anchoring (T8) — computed at issuance time, persisted always
const hash = vcHash(signedVc);
```

## Design principles

- **Chain-forward compatible** — `vcHash` is computed and stored at issuance from day 1, even before chain anchoring is live
- **Pluggable DID resolver** — delegates to `@career-protocol/did-resolver`
- **Pluggable schema resolver** — consumer provides a resolver function so schemas can live on HTTPS today and IPFS/chain later
- **Pluggable status resolver** — same pattern for StatusList2021
- **SD-JWT-VC default** for presentations; plain VC JWS supported as fallback

## Status

Phase T0 — interface sketch only. Implementation begins T0 spec freeze.
