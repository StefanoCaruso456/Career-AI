/**
 * Shared types for the api-gateway verification wiring.
 *
 * Lives in its own file (not client.ts) because the client is "server-only"
 * but these types need to be imported by client components to render the
 * verdict. Types are erased at compile time so no runtime code leaks.
 */

export interface EmploymentClaim {
  employer: string;
  role: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  /**
   * The uploader's account display name. Sent so api-gateway's LLM
   * extractor can confirm the document is addressed to the logged-in user
   * (vs. a letter belonging to someone else). Optional — omitted when the
   * session has no name (the recipient check then gets skipped server-side).
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

export interface ClaimVerificationResult {
  claimId: string;
  status: Verdict;
  confidenceTier: ConfidenceTier;
  displayStatus: string;
  matches: {
    employer: boolean;
    role: boolean;
    dates: boolean;
    /**
     * Present only when userAccountName was supplied. True when the offer
     * letter's recipient matches the uploader's account name. Absent when
     * the check was skipped (no uploader name sent).
     */
    recipient?: boolean;
    /**
     * True when the document is confidently identified as an offer letter
     * specifically (not a W-2, pay stub, employment verification, etc.).
     */
    isOfferLetter: boolean;
  };
  authenticitySource: string;
  verifiedAt: string;
  /**
   * Present only on FAILED verdicts. One short sentence explaining the
   * reason (tampering, wrong document type, wrong recipient, employer
   * mismatch, or insufficient signals).
   */
  failureReason?: string;
}

export type VerificationOutcome =
  | { ok: true; result: ClaimVerificationResult }
  | { ok: false; reason: "UNCONFIGURED" | "UNAVAILABLE" | "GATEWAY_ERROR"; detail: string };

export type OfferLetterVerificationEntry = {
  templateId: "offer-letters";
  filename: string;
  outcome: VerificationOutcome;
};
