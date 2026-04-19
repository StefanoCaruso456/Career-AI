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
import { deriveDisplayStatus, deriveFailureReason } from "../views/claim-view.js";

const ISSUER_DID =
  process.env.ISSUER_DID ?? "did:web:career-ledger.example/issuer";

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

  // 5. Issue a badge when the claim VERIFIED. Pre-W3C the badge is a minimal
  //    record pointing at the claim; when signed W3C VCs land, the payload
  //    slot holds the signed credential and the rest of the table stays.
  let badgeId: string | undefined;
  const { signals, provenance, confidenceTier } = verification;
  if (claimStatus === "VERIFIED") {
    const [badgeRow] = await db
      .insert(schema.badges)
      .values({
        claimId,
        subjectDid: actorDid,
        issuerDid: ISSUER_DID,
        badgeType: "employment",
        payload: {
          kind: "bare-employment",
          employer: claim.employer,
          role: claim.role,
          startDate: claim.startDate,
          endDate: claim.endDate,
          authenticitySource: signals.authenticity.source,
          confidenceTier,
          verifiedAt: provenance.verifiedAt,
        },
      })
      .returning({ id: schema.badges.id });
    badgeId = badgeRow.id;
  }

  // 6. Normalize to the public response shape. Internal-only fields
  //    (envelope IDs, raw signal blobs, mismatch lists) stay server-side.
  //    For FAILED verdicts the single-sentence failureReason lets the UI
  //    tell the user WHY it failed without leaking signal internals.
  return {
    claimId,
    status: claimStatus,
    confidenceTier,
    displayStatus: deriveDisplayStatus(claimStatus, confidenceTier),
    matches: {
      employer: signals.content.employer !== null,
      role: signals.content.role !== null,
      dates: signals.content.startDate !== null,
      recipient: claim.userAccountName
        ? !signals.content.mismatches?.includes("recipient")
        : undefined,
      isOfferLetter: signals.content.isOfferLetter,
    },
    authenticitySource: signals.authenticity.source,
    verifiedAt: provenance.verifiedAt,
    badgeId,
    failureReason: claimStatus === "FAILED" ? deriveFailureReason(signals) : undefined,
  };
}
