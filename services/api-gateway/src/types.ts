export interface EmploymentClaim {
  employer: string;
  role: string;
  startDate: string;
  endDate?: string;
  /**
   * The uploading user's account display name. Used by the content
   * extractor to confirm the document's recipient is the uploader.
   * Optional at the wire level — absent uploaderName means the recipient
   * check is skipped.
   */
  userAccountName?: string;
}

export type Verdict = "VERIFIED" | "PARTIAL" | "FAILED";

export type ConfidenceTier =
  | "SELF_REPORTED"
  | "EVIDENCE_SUBMITTED"
  | "REVIEWED"
  | "SOURCE_CONFIRMED"
  | "MULTI_SOURCE_CONFIRMED";

export type ClaimStatus = "PENDING" | "VERIFIED" | "PARTIAL" | "FAILED";

export interface PublicMatches {
  employer: boolean;
  role: boolean;
  dates: boolean;
  /**
   * True when the offer's recipient (as named in the document salutation)
   * plausibly matches the uploader's account name. Absent when the
   * uploader didn't supply a name.
   */
  recipient?: boolean;
  /**
   * True when the document is confidently identified as an offer letter
   * specifically (not a W-2, pay stub, or employment verification).
   */
  isOfferLetter: boolean;
}

export type AuthenticitySource = "docusign" | "pkcs7-embedded" | "unsigned";

/**
 * The public response shape returned to Career-AI when a claim is submitted.
 * Deliberately flat and narrow — internal service responses are normalized
 * down to what the frontend actually needs. No internal IDs, no opaque
 * service names, no raw signal blobs.
 */
export interface PublicClaimVerificationResponse {
  claimId: string;
  status: ClaimStatus;
  confidenceTier: ConfidenceTier;
  displayStatus: string;
  matches: PublicMatches;
  authenticitySource: AuthenticitySource;
  verifiedAt: string;
  /**
   * Present only when the verdict is VERIFIED — the ID of the badge
   * (pre-W3C credential) issued for this claim. Omitted otherwise.
   */
  badgeId?: string;
  /**
   * Present only on FAILED verdicts. One short sentence explaining the
   * primary reason the verification failed. Omitted otherwise.
   */
  failureReason?: string;
}

/**
 * The public record shape for read-back endpoints (GET /v1/claims and
 * GET /v1/claims/:id). Nests verification detail under a sub-object so the
 * UI can render both the claim state and the latest verification outcome.
 * `verification` is absent only in the transient window between claim
 * insert and the first verification row — in practice always present by
 * the time a read reaches the client.
 */
export interface PublicClaimRecord {
  claimId: string;
  claimType: string;
  status: ClaimStatus;
  confidenceTier: ConfidenceTier;
  displayStatus: string;
  payload: EmploymentClaim;
  createdAt: string;
  updatedAt: string;
  /**
   * Present only when a badge has been issued for this claim (verdict was
   * VERIFIED). Pre-W3C this is just a UUID pointer into the `badges` table.
   */
  badgeId?: string;
  verification?: {
    verifiedAt: string;
    authenticitySource: AuthenticitySource;
    matches: PublicMatches;
    failureReason?: string;
  };
}
