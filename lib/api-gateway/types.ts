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
  };
  authenticitySource: string;
  verifiedAt: string;
}

export type VerificationOutcome =
  | { ok: true; result: ClaimVerificationResult }
  | { ok: false; reason: "UNCONFIGURED" | "UNAVAILABLE" | "GATEWAY_ERROR"; detail: string };

export type OfferLetterVerificationEntry = {
  templateId: "offer-letters";
  filename: string;
  outcome: VerificationOutcome;
};
