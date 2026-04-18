# @career-ledger/pdf-signature-verifier

Private library. Verifies embedded PKCS#7 / PAdES signatures on a PDF. Answers the question: **has this PDF been edited since it was signed?**

## What it does

For each signature dictionary in a PDF:

1. Locate the signature dict (ByteRange + Contents entries)
2. Read the ByteRange `[start1, length1, start2, length2]`
3. Hash the covered bytes with SHA-256 (or whichever digest the CMS declares)
4. Decode the hex-encoded PKCS#7/CMS blob from `/Contents`
5. Parse the CMS `SignedData` with `pkijs`
6. Compare the hash we computed to the `messageDigest` attribute in the CMS signed attributes — this is the tamper check
7. Ask `pkijs` to verify the CMS signer's cryptographic signature over the signed attributes, using the embedded signer certificate — this proves the signer held the private key at signing time
8. Report per-signature results plus metadata (signer Subject DN, signature algorithm, signing time)

## What it does NOT do

- **No trust chain validation.** A signature reported as `cryptographicallyValid: true` only means (a) the bytes inside the ByteRange haven't changed since signing, and (b) the signer cert's public key matches the private key that produced the signature. It does NOT mean the signer is trusted. Trust requires building a chain to an Adobe AATL root (or another trust anchor) and is a follow-up.
- **No OCSP/CRL revocation checks.** A valid signature from a revoked cert will still report `cryptographicallyValid: true`.
- **No chain to DocuSign's public cert.** Even when the signature is from DocuSign's platform signing key, we report the signer DN as informational only — we don't confirm it actually chains to DocuSign.
- **No PAdES LTA / DSS handling.** Long-term archive signatures with embedded revocation data work for the basic verify but the DSS structure is not parsed.
- **No incremental update analysis.** `byteRangeCoversWholeFile` tells callers whether bytes outside the signed range exist; they do in multi-sig / incrementally-updated PDFs and those tail bytes are unprotected.

For Career Ledger's current demo scope, tamper detection is the critical guarantee. The rest is deferred to later phases.

## Usage

```ts
import { verifyPdfSignatures } from "@career-ledger/pdf-signature-verifier";

const outcome = await verifyPdfSignatures(pdfBytes);

if (outcome.allValid) {
  console.log(`All ${outcome.signatureCount} signatures validate cryptographically.`);
} else {
  for (const sig of outcome.signatures) {
    if (!sig.cryptographicallyValid) {
      console.log(`Signature ${sig.index}: ${sig.errors.join("; ")}`);
    }
  }
}
```

## Why two independent checks

The digest check and the signature check catch different kinds of tampering:

- **Digest mismatch** — attacker edited PDF bytes inside the ByteRange after signing. The messageDigest in the CMS no longer matches the bytes. This is the main "document edited since signing" case.
- **Signature mismatch** — attacker replaced the CMS blob with one they generated with a different private key. The signer cert still says DocuSign, but the signature on the signed attributes fails verification.

Both checks must pass for `cryptographicallyValid` to be true.

## Known limits

- **ByteRange scope**: if the ByteRange doesn't cover the entire file, bytes outside it can be modified freely without breaking the signature. We surface `byteRangeCoversWholeFile: boolean` so callers can decide whether to trust incremental updates.
- **Multi-signature documents**: we check every signature independently. If one signature invalidates and another still validates (because they cover different byte ranges), `allValid` is false.
- **Encrypted PDFs**: pdf-lib can open most encrypted PDFs in read mode, but if the encryption method is unusual (as with `signed-encrypted-pubkey-with-catalog-ref.pdf` from the pyHanko corpus) extraction throws. Treat as a diagnostic error, not a tampering signal.

## Dependencies

- [`pdf-lib`](https://github.com/Hopding/pdf-lib) — locate signature dictionaries, read ByteRange + Contents
- [`pkijs`](https://github.com/PeculiarVentures/PKI.js) — parse CMS SignedData, verify signatures (backed by Node's `webcrypto`)
- [`asn1js`](https://github.com/PeculiarVentures/ASN1.js) — ASN.1 parsing under `pkijs`

No external service calls. Pure Node/TypeScript, works offline.
