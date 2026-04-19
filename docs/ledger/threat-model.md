# Career Ledger — Threat Model

**Status**: Draft · Phase T0

## Scope

This threat model covers the Career Ledger backend and the nested Career Protocol. Career-AI (frontend) has its own threat considerations covered in its own docs.

## Assets

1. **User private keys** (wallet signing keys) — KMS-wrapped, unlocked by passkey
2. **Issuer signing key** — platform private key used to sign VCs
3. **Encrypted VCs in wallet storage** — contain PII, protected by per-user encryption keys
4. **DID ⟷ human identity binding** — one-per-human enforcement depends on ID.me proofing
5. **Source artifacts during verification** — transient (hours to days), then purged via verify-and-forget
6. **Reputation / trust scores** — business-sensitive; private moat
7. **Audit logs** — used for compliance and dispute resolution

## Trust boundaries

- Career-AI ⟷ career-ledger (HTTPS, mutual auth via service tokens)
- career-ledger ⟷ KMS (IAM-bound)
- career-ledger ⟷ user devices (WebAuthn, TLS)
- candidate-agent ⟷ employer-agent (DID-authenticated, via a2a-gateway)
- issuer-service ⟷ third-party sync providers (ADP/Argyle/Pinwheel; short-lived OAuth tokens)

## Threats (initial inventory — to be expanded)

### T1. Forged credential
An attacker constructs a VC claiming credentials they don't have.
**Mitigation**: All VCs must be signed by a trusted issuer key. Verifiers check the signature against the issuer's published DID document. Unsigned or wrong-issuer VCs are rejected.

### T2. Credential theft from wallet
An attacker compromises wallet storage and steals encrypted VCs.
**Mitigation**: VCs are encrypted with per-user keys wrapped by the user's passkey. A stolen ciphertext blob is useless without the passkey. Defense in depth: rate-limit decryption, audit every decryption, alert on anomalous access patterns.

### T3. Key compromise (issuer)
Platform issuer signing key is exfiltrated, allowing the attacker to mint fraudulent credentials.
**Mitigation**: Key lives in hardware KMS with IAM controls. Rotation ceremony documented. Compromise response: rotate key, re-sign in-scope credentials, publish revocation list, broadcast rotation via DID document update.

### T4. Key compromise (holder)
A user's wallet signing key is compromised (passkey theft, device malware).
**Mitigation**: Passkeys are phishing-resistant and device-bound. Recovery via WebAuthn attestation from a second device + identity re-proofing. All holder keys are rotatable without re-issuing the underlying VC (VC subject is a DID, not a key).

### T5. Sybil / multi-wallet fraud
One human creates multiple DIDs to inflate endorsements or game reputation.
**Mitigation**: ID.me (or equivalent) identity proofing at signup binds a single DID per verified human. Reputation engine watches for collusion patterns (see `packages/collusion-detection`).

### T6. Endorsement ring / collusion
A group of users vouches for each other to fabricate a reputation.
**Mitigation**: `collusion-detection` analyzes graph features (small-world clustering, timestamp clustering, prior-relationship validation). Low-trust endorsements don't affect reputation proportionally. Private logic so attackers cannot game it directly.

### T7. Recruiter spam / fake role
A bad-faith recruiter agent floods candidate agents with fake role offers.
**Mitigation**: A2A gateway requires recruiter agents to stake credits per outreach (see Phase T7). Verified employer DIDs required. Rate limits per recruiter.

### T8. Replay of presentations
A recruiter or attacker reuses a captured Verifiable Presentation against a different verifier.
**Mitigation**: VPs MUST include verifier DID in the challenge, a nonce, and a short expiration. Verifiers MUST check all three.

### T9. Raw PII leakage before verify-and-forget
Attacker exfiltrates source artifacts while they exist in the transient verification window.
**Mitigation**: Encrypt at rest, short retention window, access audited, minimize the time an artifact lives pre-purge. Purge must be confirmed via hash match before deletion to prevent data loss.

### T10. Hash collision attack on vcHash
Attacker crafts a different VC that hashes to the same value as a legitimate one.
**Mitigation**: Use SHA-256 (collision-resistant for all practical purposes). Monitor NIST guidance; migrate to SHA-3 family if needed.

### T11. On-chain correlation (T8 only)
Attacker scrapes the chain to correlate wallet addresses across credentials and infer human identities.
**Mitigation**: On-chain owner is a *hash* of the DID with a per-user salt, not the DID itself. No PII on chain. Chain anchoring is opt-in per user (TBD during T8 design).

## Next steps

- [ ] STRIDE pass on each service
- [ ] Dependency supply chain model
- [ ] Abuse cases for agent negotiation (Phase T5+)
- [ ] Legal review of hash-on-chain posture before Phase T8
