import type {
  AuthenticitySource,
  ClaimStatus,
  ConfidenceTier,
  EmploymentClaim,
  PublicClaimRecord,
  PublicMatches,
} from "../types.js";

/**
 * Shared response-shape builders for claim read/write endpoints.
 *
 * Submit and read-back paths derive the same display copy and match
 * booleans from the same signals, so the logic lives here and both paths
 * import from it. Keeping these pure helpers (no DB, no HTTP) lets the
 * read routes build a record from whatever query rows they load.
 */

export interface ClaimRowForView {
  id: string;
  claimType: string;
  status: string;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface VerificationRowForView {
  verdict: string;
  confidenceTier: string;
  signals: unknown;
  provenance: unknown;
}

export interface BadgeRowForView {
  id: string;
  revokedAt: Date | null;
}

export function buildPublicClaimRecord(
  claim: ClaimRowForView,
  verification: VerificationRowForView | null,
  badge: BadgeRowForView | null = null,
): PublicClaimRecord {
  const status = (claim.status as ClaimStatus) ?? "PENDING";
  const payload = claim.payload as EmploymentClaim;
  const confidenceTier =
    (verification?.confidenceTier as ConfidenceTier | undefined) ?? "SELF_REPORTED";

  const record: PublicClaimRecord = {
    claimId: claim.id,
    claimType: claim.claimType,
    status,
    confidenceTier,
    displayStatus: deriveDisplayStatus(status, confidenceTier),
    payload,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
    badgeId: badge && !badge.revokedAt ? badge.id : undefined,
  };

  if (verification) {
    const signals = verification.signals as VerificationSignals;
    const provenance = verification.provenance as { verifiedAt?: string } | null;
    record.verification = {
      verifiedAt: provenance?.verifiedAt ?? claim.updatedAt.toISOString(),
      authenticitySource: (signals?.authenticity?.source ?? "unsigned") as AuthenticitySource,
      matches: buildMatches(signals, payload),
      failureReason: status === "FAILED" ? deriveFailureReason(signals) : undefined,
    };
  }

  return record;
}

export function deriveDisplayStatus(status: ClaimStatus, tier: string): string {
  if (status === "VERIFIED" && tier === "SOURCE_CONFIRMED") return "Verified by source";
  if (status === "VERIFIED") return "Verified";
  if (status === "PARTIAL") return "Evidence submitted";
  if (status === "FAILED") return "Could not verify";
  return "Pending";
}

export function buildMatches(
  signals: VerificationSignals | null | undefined,
  claim: EmploymentClaim,
): PublicMatches {
  const content = signals?.content;
  const mismatches = content?.mismatches ?? [];
  return {
    employer: content?.employer !== null && content?.employer !== undefined,
    role: content?.role !== null && content?.role !== undefined,
    dates: content?.startDate !== null && content?.startDate !== undefined,
    recipient: claim.userAccountName
      ? !mismatches.includes("recipient")
      : undefined,
    isOfferLetter: Boolean(content?.isOfferLetter),
  };
}

export function deriveFailureReason(signals: VerificationSignals | null | undefined): string {
  const tampering = signals?.tampering;
  if (tampering?.detected) {
    const detailReason =
      tampering.details &&
      typeof tampering.details === "object" &&
      typeof (tampering.details as { reason?: unknown }).reason === "string"
        ? ((tampering.details as { reason: string }).reason)
        : null;
    if (detailReason) return detailReason;
    if (tampering.method === "pkcs7-verification") {
      return "Cryptographic signature verification failed — PDF bytes have been modified since signing.";
    }
    if (tampering.method === "structural-anomaly") {
      return "Document structure suggests tampering (DocuSign markers present but signature structure stripped).";
    }
    return "Tampering detected in the uploaded document.";
  }

  const mismatches = signals?.content?.mismatches ?? [];
  if (mismatches.includes("documentType")) {
    return "This document doesn't look like an offer letter. Offer letters extend a named job offer — W-2s, pay stubs, employment verification letters, and performance reviews don't qualify.";
  }
  if (mismatches.includes("recipient")) {
    return "The letter is addressed to someone other than you. Upload the offer letter issued to your own account name.";
  }
  if (mismatches.includes("employer")) {
    return "The claimed employer name was not found anywhere in the document.";
  }

  return "Not enough positive signals to verify the document. No trusted source signature and content did not fully match the claim.";
}

interface VerificationSignals {
  tampering?: {
    detected: boolean;
    method: string;
    details?: Record<string, unknown>;
  };
  authenticity?: {
    source?: string;
  };
  content?: {
    employer: string | null;
    role: string | null;
    startDate: string | null;
    endDate: string | null;
    isOfferLetter?: boolean;
    mismatches?: string[];
  };
}
