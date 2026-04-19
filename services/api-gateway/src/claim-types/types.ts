import type { z } from "zod";
import type {
  AuthenticitySignal,
  ConfidenceTier,
  ContentMatchSignal,
  TamperingSignal,
  Verdict,
} from "../verifier/types.js";

/**
 * Claim-type registry interface.
 *
 * Each document type the gateway can verify (offer-letter, employment-
 * verification, education diploma, transcript, ...) implements one of these.
 * The generic orchestrator dispatches through the registry, so adding a new
 * type is a handler module plus a registry entry — no changes to orchestrator,
 * tampering detector, or DB code.
 *
 * Shared across types:
 *   - PDF extraction (pdf-extractor service)
 *   - Tampering detection (PKCS7 / DocuSign structural anomaly)
 *   - Badge issuance on VERIFIED
 *   - Read-back via GET /v1/claims
 *
 * Per-type:
 *   - Claim payload schema (what the user asserts)
 *   - Authenticity expectation (which domain should the signer resolve to)
 *   - Content extraction (LLM prompt + output schema)
 *   - Verdict rules (how signals combine into VERIFIED/PARTIAL/FAILED)
 *   - Badge payload (what the badge carries)
 *   - Lineage identity (what counts as "the same underlying credential"
 *     for versioning — stage 2)
 */
export type ClaimGroup = "employment" | "education" | "transcript";

export interface ClaimAuthenticityInput {
  /**
   * Domain the signature-bearing evidence (DocuSign CoC sender, PKCS7 DN)
   * should resolve to for this claim to count as "from the right issuer."
   * Null when the claim type has no natural domain to match against, in
   * which case authenticity contributes no positive signal and verdict
   * must rely on content + tampering only.
   */
  expectedDomain: string | null;
  /**
   * Human-readable label used inside AuthenticitySignal.reason. For
   * employment claims this is the employer; for education it's the
   * institution. Safe to surface in user-facing copy.
   */
  expectedDomainLabel: string;
}

export interface ClaimVerdictInput {
  tampering: TamperingSignal;
  authenticity: AuthenticitySignal;
  content: ContentMatchSignal;
}

export interface ClaimBadgePayloadInput<TClaim> {
  claim: TClaim;
  authenticitySource: string;
  confidenceTier: ConfidenceTier;
  verifiedAt: string;
}

export interface ClaimTypeHandler<TClaim = unknown> {
  /**
   * Stable identifier used in URLs (`POST /v1/claims/:kind`), DB columns
   * (`claims.claim_type`, `badges.badge_type`), and registry lookups.
   */
  kind: string;

  /**
   * Lineage grouping. Offer-letter and employment-verification share
   * `group: "employment"` so re-verifying the same (employer, role)
   * through either document type lands on the same badge lineage.
   * Education and transcript each have their own group.
   */
  group: ClaimGroup;

  /**
   * Verifier name recorded on the verifications row (e.g.
   * "api-gateway:offer-letter@0.1.0"). Lets read-back paths distinguish
   * which type-specific pipeline produced a given verification.
   */
  verifierName: string;

  /**
   * Zod schema for the claim payload the caller asserts.
   */
  schema: z.ZodSchema<TClaim>;

  /**
   * Compute the authenticity expectation (domain + label) for this claim.
   */
  buildAuthenticityInput(claim: TClaim): ClaimAuthenticityInput;

  /**
   * Extract claim-specific content signals from the document text.
   */
  extractContent(text: string, claim: TClaim): Promise<ContentMatchSignal>;

  /**
   * Combine independent signals into a verdict + confidence tier.
   */
  computeVerdict(input: ClaimVerdictInput): {
    verdict: Verdict;
    confidenceTier: ConfidenceTier;
  };

  /**
   * Build the badge payload stored in `badges.payload` on VERIFIED.
   * Pre-W3C this is a plain object with a `kind` discriminator; when signed
   * VCs land, the same field holds the signed credential instead.
   */
  buildBadgePayload(input: ClaimBadgePayloadInput<TClaim>): unknown;
}
