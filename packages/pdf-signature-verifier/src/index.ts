import { extractSignatures } from "./extract.js";
import { verifySignature } from "./verify.js";
import type { VerificationOutcome } from "./types.js";

export * from "./types.js";
export { extractSignatures } from "./extract.js";
export { verifySignature } from "./verify.js";

/**
 * Top-level entry point: verify every PKCS#7 / PAdES signature in a PDF.
 *
 * Returns an outcome describing what was found and which signatures are
 * cryptographically valid (tamper check + signature check passing).
 *
 * Trust chain validation is NOT performed — no AATL check, no OCSP/CRL.
 * A signature that is `cryptographicallyValid: true` here merely means
 * the PDF bytes haven't been edited since it was signed and the signer
 * cert's public key matches the private key that produced the signature.
 */
export async function verifyPdfSignatures(pdfBytes: Uint8Array): Promise<VerificationOutcome> {
  const errors: string[] = [];
  let sigs;
  try {
    sigs = await extractSignatures(pdfBytes);
  } catch (err) {
    return {
      allValid: false,
      signatureCount: 0,
      signatures: [],
      errors: [`extract: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const results = await Promise.all(sigs.map((s) => verifySignature(pdfBytes, s)));
  const allValid = results.length > 0 && results.every((r) => r.cryptographicallyValid);

  return {
    allValid,
    signatureCount: sigs.length,
    signatures: results,
    errors,
  };
}
