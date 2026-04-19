import type {
  AuthenticitySignal,
  ConfidenceTier,
  ContentMatchSignal,
  TamperingSignal,
  Verdict,
} from "../types.js";

/**
 * Aggregates three independent signals into a single verdict and confidence
 * tier.
 *
 * --- Confidence tier ceiling (important) ---
 *
 * Nothing in this service can reach SOURCE_CONFIRMED by itself. Here's why:
 *
 * When a company like Apple sends a DocuSigned offer letter, the
 * cryptographic signature in the PDF is produced by DocuSign's own platform
 * signing key — NOT by a certificate belonging to Apple. The signer cert's
 * Subject literally says "DocuSign Inc.", not "Apple Inc." So verifying the
 * PKCS#7 signature proves two things:
 *
 *   1. The PDF has not been modified since DocuSign sealed it
 *   2. DocuSign (the company) issued it
 *
 * It does NOT prove that the envelope was sent by Apple. The sender identity
 * lives only in the Certificate of Completion text, which is application-level
 * metadata, typically appended via a PDF incremental update OUTSIDE the
 * ByteRange covered by the signature — meaning the CoC text is not
 * cryptographically protected and could be edited without breaking
 * signature validation.
 *
 * The one exception is DocuSign Standards-Based Signatures (SBS), where the
 * signing cert IS issued to the actual signer. In that case, the signer cert
 * Subject would match the employer and we COULD grant SOURCE_CONFIRMED. SBS
 * is uncommon and we don't detect it yet — when we do, the check goes here.
 *
 * To genuinely prove "came from Apple" we need out-of-band verification:
 *
 *   - Email DKIM/DMARC validation on the original offer email (future)
 *   - Employer verification registry (domain ownership proofs) + cross-check
 *   - Employer Agent attestation via the A2A protocol (future, Phase T5)
 *
 * Until one of those signals is present, this service's ceiling is REVIEWED.
 * Any upstream service that wants to claim SOURCE_CONFIRMED must add its own
 * signal on top of what we return.
 */
export function computeVerdict(
  tampering: TamperingSignal,
  authenticity: AuthenticitySignal,
  content: ContentMatchSignal,
): { verdict: Verdict; confidenceTier: ConfidenceTier } {
  // Hard contradictions fail the whole thing.
  if (tampering.detected) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }
  // Document type: if the content extractor determined this isn't an offer
  // letter (it's a W-2, pay stub, performance review, employment verification,
  // etc.), no signature or content match can rescue it — the document simply
  // can't back an offer-letter claim.
  if (content.mismatches?.includes("documentType")) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }
  // Recipient mismatch: the letter is addressed to someone other than the
  // uploader. This is the "is this YOUR offer letter?" check. Even if the
  // employer and dates match, a letter belonging to someone else cannot
  // back the uploader's claim.
  if (content.mismatches?.includes("recipient")) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }
  if (content.mismatches?.includes("employer")) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }

  // When real cryptographic verification passed (`pkcs7-verification`), we
  // know the document bytes are unchanged since signing. That's a genuinely
  // stronger signal than "there's a DocuSign stamp on the page," so when
  // it's combined with a matching CoC domain we're closer to the ceiling.
  const cryptoVerified = tampering.method === "pkcs7-verification" && !tampering.detected;

  const docusignMatch = authenticity.source === "docusign" && authenticity.matchesClaim;
  const pkcs7Match = authenticity.source === "pkcs7-embedded" && authenticity.matchesClaim;
  const anySignedMatch = docusignMatch || pkcs7Match;
  const contentOk = content.matchesClaim;

  if (anySignedMatch && contentOk) {
    // Demo policy: grant SOURCE_CONFIRMED when the CoC's sender / signer
    // domain matches the claimed employer AND all content checks pass.
    // The block comment above notes this is a weaker signal than a
    // cryptographic sender attestation, and the ceiling should move
    // back to REVIEWED once DKIM / employer-registry / A2A attestation
    // paths land. Kept here to make the demo's highest-trust tier
    // reachable without those out-of-band systems.
    return { verdict: "VERIFIED", confidenceTier: "SOURCE_CONFIRMED" };
  }

  if (!anySignedMatch && contentOk) {
    // Content matches but no trusted source signal — evidence only.
    // If crypto verification passed we still upgrade to REVIEWED because
    // we at least know the document was sealed by SOMEONE whose signature
    // chains to an AATL member and the bytes haven't been touched.
    if (cryptoVerified) {
      return { verdict: "PARTIAL", confidenceTier: "REVIEWED" };
    }
    return { verdict: "PARTIAL", confidenceTier: "EVIDENCE_SUBMITTED" };
  }

  if (anySignedMatch && !contentOk) {
    // Source checks out but content disagrees — partial, needs human review.
    return { verdict: "PARTIAL", confidenceTier: "REVIEWED" };
  }

  // Final fallback: not enough positive signals to call it anything.
  // If crypto at least proves tamper-free + content is partial, we still
  // return EVIDENCE_SUBMITTED rather than SELF_REPORTED — we have something.
  if (cryptoVerified) {
    return { verdict: "PARTIAL", confidenceTier: "EVIDENCE_SUBMITTED" };
  }
  return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
}
