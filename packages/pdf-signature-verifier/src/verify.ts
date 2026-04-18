import { hashByteRange, byteRangeCoversWholeFile } from "./hash.js";
import { parseCmsBlob, bytesEqual } from "./cms.js";
import type { ExtractedSignature, SignatureValidationResult } from "./types.js";

/**
 * Verify one extracted signature against the PDF bytes it came from.
 *
 * Two independent checks:
 *
 * 1. **Digest match** — compute SHA-256 (or whichever digest the CMS
 *    declared) over the ByteRange of the PDF, compare to the
 *    messageDigest attribute embedded in the CMS SignedData. If the
 *    PDF was edited since signing, these differ.
 *
 * 2. **Signature verify** — ask pkijs to verify the CMS signer's
 *    cryptographic signature over the signed attributes, using the
 *    public key from the embedded signer certificate. Proves the
 *    signer held the corresponding private key at signing time.
 *
 * We do NOT validate the certificate chain here. A future pass
 * (chain.ts) will build and verify the path to Adobe AATL roots.
 */
export async function verifySignature(
  pdfBytes: Uint8Array,
  sig: ExtractedSignature,
): Promise<SignatureValidationResult> {
  const errors: string[] = [];
  const result: SignatureValidationResult = {
    index: sig.index,
    digestValid: false,
    signatureValid: false,
    cryptographicallyValid: false,
    byteRange: sig.byteRange,
    byteRangeCoversWholeFile: byteRangeCoversWholeFile(pdfBytes, sig.byteRange),
    filter: sig.filter,
    subFilter: sig.subFilter,
    errors,
  };

  let parsed;
  try {
    parsed = parseCmsBlob(sig.cmsBytes);
  } catch (err) {
    errors.push(`cms-parse: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  result.digestAlgorithm = parsed.digestAlgorithm;
  result.signatureAlgorithm = parsed.signatureAlgorithm;
  result.cmsSigningTime = parsed.signingTime;
  result.signerSubjectDN = parsed.signerSubjectDN;
  result.signerIssuerDN = parsed.signerIssuerDN;

  // Digest check — hash the ByteRange and compare to the signed attributes.
  try {
    const digestAlg = parsed.digestAlgorithm === "SHA-256" || parsed.digestAlgorithm === "SHA-384" || parsed.digestAlgorithm === "SHA-512"
      ? parsed.digestAlgorithm
      : "SHA-256";
    const computed = await hashByteRange(pdfBytes, sig.byteRange, digestAlg);
    if (parsed.messageDigest && bytesEqual(parsed.messageDigest, computed)) {
      result.digestValid = true;
    } else {
      errors.push(
        parsed.messageDigest
          ? "digest-mismatch: computed hash of ByteRange differs from CMS messageDigest (document was edited since signing, or the ByteRange is wrong)"
          : "digest-missing: no messageDigest in signed attributes",
      );
    }
  } catch (err) {
    errors.push(`digest: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Signature check — hand the ByteRange bytes to pkijs and let it verify
  // the CMS signer's cryptographic signature over the signed attributes.
  try {
    const combined = concatByteRange(pdfBytes, sig.byteRange);
    const dataBuffer = new ArrayBuffer(combined.byteLength);
    new Uint8Array(dataBuffer).set(combined);
    const signerIndex = 0;
    const verifyResult = await parsed.signedData.verify({
      signer: signerIndex,
      data: dataBuffer,
      extendedMode: true,
      checkChain: false,
    });
    // In extended mode, `verify` returns an object with `signatureVerified`.
    if (typeof verifyResult === "object" && verifyResult !== null) {
      const obj = verifyResult as { signatureVerified?: boolean };
      result.signatureValid = obj.signatureVerified === true;
      if (!result.signatureValid) errors.push("signature-verify: pkijs reported signatureVerified=false");
    } else if (typeof verifyResult === "boolean") {
      result.signatureValid = verifyResult;
      if (!verifyResult) errors.push("signature-verify: pkijs returned false");
    }
  } catch (err) {
    errors.push(`signature-verify: ${err instanceof Error ? err.message : String(err)}`);
  }

  result.cryptographicallyValid = result.digestValid && result.signatureValid && errors.length === 0;
  return result;
}

function concatByteRange(pdfBytes: Uint8Array, byteRange: number[]): Uint8Array {
  const [s1, l1, s2, l2] = byteRange;
  const out = new Uint8Array(l1 + l2);
  out.set(pdfBytes.subarray(s1, s1 + l1), 0);
  out.set(pdfBytes.subarray(s2, s2 + l2), l1);
  return out;
}
