/**
 * Employment claim orchestrator.
 *
 * This is where the business flow lives. The route handler is a thin
 * adapter that validates input and hands off here. This function decides:
 *
 *   - insert a claim row
 *   - call document-verifier
 *   - insert a verification row
 *   - update claim status based on the verdict
 *   - return a normalized public response
 *
 * If we later add: fraud checks, duplicate-claim detection, trust policy
 * enforcement, issuer-service handoff, or endorsement requests — they live
 * here, not in the route handler and never in the frontend.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { verifyDocument } from "../verifier/index.js";
import type { VerifyResponse } from "../verifier/types.js";
import type { ClaimStatus, EmploymentClaim, PublicClaimVerificationResponse } from "../types.js";

export interface SubmitEmploymentClaimInput {
  actorDid: string;
  file: Uint8Array;
  filename: string;
  claim: EmploymentClaim;
  certificateFile?: Uint8Array;
  certificateFilename?: string;
}

export async function submitEmploymentClaim(
  input: SubmitEmploymentClaimInput,
): Promise<PublicClaimVerificationResponse> {
  const { actorDid, file, filename, claim, certificateFile, certificateFilename } = input;

  // 1. Persist the claim before we do anything irreversible. If verification
  //    fails partway through, we still have a record of what the user claimed.
  const [inserted] = await db
    .insert(schema.claims)
    .values({
      ownerDid: actorDid,
      claimType: "employment",
      status: "PENDING",
      payload: claim,
    })
    .returning({ id: schema.claims.id });

  const claimId = inserted.id;

  // 2. Run in-process verification. Keep the raw response; we persist it
  //    verbatim so we have an audit trail of exactly what each verifier said.
  let verification: VerifyResponse;
  try {
    verification = await verifyDocument({
      file,
      filename,
      claim,
      certificateFile,
      certificateFilename,
    });
  } catch (err) {
    // Mark the claim as FAILED with a synthetic verification row so downstream
    // consumers see a consistent shape even when verification errors out.
    await db
      .update(schema.claims)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(schema.claims.id, claimId));
    throw new Error(`verification failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Append the verification row. Never mutate prior rows — each attempt
  //    is appended, and the claim's current status is derived from the latest.
  await db.insert(schema.verifications).values({
    claimId,
    verifier: verification.provenance.verifier,
    verdict: verification.verdict,
    confidenceTier: verification.confidenceTier,
    signals: verification.signals,
    provenance: verification.provenance,
  });

  // 4. Derive claim status from the verdict.
  const claimStatus: ClaimStatus = verification.verdict as ClaimStatus;
  await db
    .update(schema.claims)
    .set({ status: claimStatus, updatedAt: new Date() })
    .where(eq(schema.claims.id, claimId));

  // 5. Normalize to the public response shape. This is where we strip
  //    internal-only fields (envelope IDs, mismatched field lists, raw
  //    signals) that the frontend doesn't need. For FAILED verdicts we
  //    surface a single human-readable failureReason so the UI can tell
  //    the user WHY it failed without leaking internal signal internals.
  const { signals, provenance, confidenceTier } = verification;
  return {
    claimId,
    status: claimStatus,
    confidenceTier,
    displayStatus: displayStatusFor(claimStatus, confidenceTier),
    matches: {
      employer: signals.content.employer !== null,
      role: signals.content.role !== null,
      dates: signals.content.startDate !== null,
    },
    authenticitySource: signals.authenticity.source,
    verifiedAt: provenance.verifiedAt,
    failureReason: claimStatus === "FAILED" ? deriveFailureReason(signals) : undefined,
  };
}

function deriveFailureReason(signals: {
  tampering: { detected: boolean; method: string; details?: Record<string, unknown> };
  content: { mismatches?: string[] };
}): string {
  // Tampering hard-fails override everything else — surface that first.
  if (signals.tampering.detected) {
    const detailReason =
      signals.tampering.details &&
      typeof signals.tampering.details === "object" &&
      typeof (signals.tampering.details as { reason?: unknown }).reason === "string"
        ? ((signals.tampering.details as { reason: string }).reason)
        : null;
    if (detailReason) return detailReason;
    if (signals.tampering.method === "pkcs7-verification") {
      return "Cryptographic signature verification failed — PDF bytes have been modified since signing.";
    }
    if (signals.tampering.method === "structural-anomaly") {
      return "Document structure suggests tampering (DocuSign markers present but signature structure stripped).";
    }
    return "Tampering detected in the uploaded document.";
  }

  if (signals.content.mismatches?.includes("employer")) {
    return "The claimed employer name was not found anywhere in the document.";
  }

  // Fallback — FAILED without tampering and without employer mismatch means
  // the verdict fell through to the "insufficient signals" branch.
  return "Not enough positive signals to verify the document. No trusted source signature and content did not fully match the claim.";
}

function displayStatusFor(status: ClaimStatus, tier: string): string {
  if (status === "VERIFIED" && tier === "SOURCE_CONFIRMED") return "Verified by source";
  if (status === "VERIFIED") return "Verified";
  if (status === "PARTIAL") return "Evidence submitted";
  if (status === "FAILED") return "Could not verify";
  return "Pending";
}
