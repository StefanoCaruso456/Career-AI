export interface EmploymentClaim {
  employer: string;
  role: string;
  startDate: string;
  endDate?: string;
}

export type Verdict = "VERIFIED" | "PARTIAL" | "FAILED";

export type ConfidenceTier =
  | "SELF_REPORTED"
  | "EVIDENCE_SUBMITTED"
  | "REVIEWED"
  | "SOURCE_CONFIRMED"
  | "MULTI_SOURCE_CONFIRMED";

export type ClaimStatus = "PENDING" | "VERIFIED" | "PARTIAL" | "FAILED";

/**
 * The public response shape returned to Career-AI. Deliberately narrow —
 * internal service responses are normalized down to what the frontend
 * actually needs. No internal IDs, no opaque service names, no raw signal
 * blobs. If the frontend wants deeper detail it makes a separate request.
 */
export interface PublicClaimVerificationResponse {
  claimId: string;
  status: ClaimStatus;
  confidenceTier: ConfidenceTier;
  displayStatus: string;
  matches: {
    employer: boolean;
    role: boolean;
    dates: boolean;
  };
  authenticitySource: "docusign" | "pkcs7-embedded" | "unsigned";
  verifiedAt: string;
  /**
   * Present only on FAILED verdicts. One short sentence explaining the
   * primary reason the verification failed — tampering signal detail,
   * content mismatch, or "insufficient signals" fallback. Safe to surface
   * in user-facing copy. Omitted for VERIFIED / PARTIAL / PENDING.
   */
  failureReason?: string;
}
