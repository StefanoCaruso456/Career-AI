/**
 * Generic claim-submission orchestrator.
 *
 * Dispatches through the claim-type registry. The flow is the same for
 * every type:
 *
 *   1. Persist a claim row with claim_type = handler.kind
 *   2. Extract the PDF(s) via pdf-extractor
 *   3. Run shared tampering detection
 *   4. Run type-specific authenticity expectation + per-type content
 *      extraction
 *   5. Run type-specific verdict rules
 *   6. Append a verifications row (never mutate prior rows)
 *   7. Update claim status from the verdict
 *   8. On VERIFIED, issue a badge using handler.buildBadgePayload
 *   9. Normalize into the public response shape
 *
 * If verification throws, a synthetic verifier-error verifications row is
 * appended before the claim is marked FAILED, so the invariant "claim
 * status is derived from the latest verification" holds through system
 * errors too.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ClaimTypeHandler } from "../claim-types/types.js";
import { db, schema } from "../db/index.js";
import type {
  ClaimStatus,
  PublicClaimVerificationResponse,
} from "../types.js";
import { VerificationError } from "../verifier/index.js";
import { extractDocument } from "../verifier/clients/pdf-extractor.js";
import type { ExtractionResult } from "../verifier/clients/pdf-extractor.js";
import { detectTampering } from "../verifier/verifiers/tampering.js";
import { checkAuthenticity } from "../verifier/verifiers/authenticity.js";
import type { VerifyResponse } from "../verifier/types.js";
import { deriveDisplayStatus, deriveFailureReason } from "../views/claim-view.js";

const ISSUER_DID =
  process.env.ISSUER_DID ?? "did:web:career-ledger.example/issuer";

export interface SubmitClaimInput<TClaim> {
  actorDid: string;
  file: Uint8Array;
  filename: string;
  claim: TClaim;
  certificateFile?: Uint8Array;
  certificateFilename?: string;
}

export async function submitClaim<TClaim>(
  handler: ClaimTypeHandler<TClaim>,
  input: SubmitClaimInput<TClaim>,
): Promise<PublicClaimVerificationResponse> {
  const { actorDid, file, filename, claim, certificateFile, certificateFilename } = input;

  // 1. Persist the claim before anything irreversible.
  const [inserted] = await db
    .insert(schema.claims)
    .values({
      ownerDid: actorDid,
      claimType: handler.kind,
      status: "PENDING",
      payload: claim as unknown as Record<string, unknown>,
    })
    .returning({ id: schema.claims.id });

  const claimId = inserted.id;

  let verification: VerifyResponse;
  try {
    verification = await runVerification(handler, {
      file,
      filename,
      claim,
      certificateFile,
      certificateFilename,
    });
  } catch (err) {
    // Append a synthetic verifier-error row before updating status so
    // "claim.status is derived from the latest verification" holds on
    // system errors. Then surface the typed error so the route can map
    // it to the right HTTP code.
    const errorMessage = err instanceof Error ? err.message : String(err);
    const nowIso = new Date().toISOString();
    await db.insert(schema.verifications).values({
      claimId,
      verifier: `${handler.verifierName}:error`,
      verdict: "FAILED",
      confidenceTier: "SELF_REPORTED",
      signals: {
        error: { kind: "verifier_error", message: errorMessage },
      },
      provenance: {
        verifiedAt: nowIso,
        verifier: `${handler.verifierName}:error`,
      },
    });
    await db
      .update(schema.claims)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(schema.claims.id, claimId));
    if (err instanceof VerificationError) throw err;
    throw new Error("verification failed", { cause: err });
  }

  // 3. Append the verification row.
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

  // 5. Issue a badge when VERIFIED. Badges are append-only per lineage:
  //    re-verifying the same (employer, role) through any handler in the
  //    same group bumps the version instead of creating an unrelated
  //    badge row. Prior versions stay in the table.
  let badgeId: string | undefined;
  let badgeVersion: number | undefined;
  const { signals, provenance, confidenceTier } = verification;
  if (claimStatus === "VERIFIED") {
    const lineageKey = computeLineageKey(handler, claim);
    const [latestExisting] = await db
      .select({ version: schema.badges.version })
      .from(schema.badges)
      .where(
        and(
          eq(schema.badges.subjectDid, actorDid),
          eq(schema.badges.lineageKey, lineageKey),
          isNull(schema.badges.revokedAt),
        ),
      )
      .orderBy(desc(schema.badges.version))
      .limit(1);
    const nextVersion = (latestExisting?.version ?? 0) + 1;

    const payload = handler.buildBadgePayload({
      claim,
      authenticitySource: signals.authenticity.source,
      confidenceTier,
      verifiedAt: provenance.verifiedAt,
    });
    const [badgeRow] = await db
      .insert(schema.badges)
      .values({
        claimId,
        subjectDid: actorDid,
        issuerDid: ISSUER_DID,
        badgeType: handler.kind,
        lineageKey,
        version: nextVersion,
        payload: payload as Record<string, unknown>,
      })
      .returning({ id: schema.badges.id, version: schema.badges.version });
    badgeId = badgeRow.id;
    badgeVersion = badgeRow.version;
  }

  // 6. Public response. Type-specific matches shape still lives on
  //    PublicClaimVerificationResponse — generalized in the next pass
  //    when non-offer-letter types come online.
  return {
    claimId,
    status: claimStatus,
    confidenceTier,
    displayStatus: deriveDisplayStatus(claimStatus, confidenceTier),
    matches: {
      employer: signals.content.employer !== null,
      role: signals.content.role !== null,
      dates: signals.content.startDate !== null,
      recipient: (claim as { userAccountName?: string }).userAccountName
        ? !signals.content.mismatches?.includes("recipient")
        : undefined,
      isOfferLetter: signals.content.isOfferLetter,
    },
    authenticitySource: signals.authenticity.source,
    verifiedAt: provenance.verifiedAt,
    badgeId,
    badgeVersion,
    failureReason: claimStatus === "FAILED" ? deriveFailureReason(signals) : undefined,
  };
}

/**
 * sha256(group || ":" || identity) as a hex string. Hashing (vs. storing
 * the plaintext identity) keeps the column fixed-width and doesn't leak
 * full claim payloads into a field that might be indexed or logged.
 */
function computeLineageKey<TClaim>(
  handler: ClaimTypeHandler<TClaim>,
  claim: TClaim,
): string {
  const identity = handler.buildLineageIdentity(claim);
  return createHash("sha256").update(`${handler.group}:${identity}`).digest("hex");
}

interface RunVerificationInput<TClaim> {
  file: Uint8Array;
  filename: string;
  claim: TClaim;
  certificateFile?: Uint8Array;
  certificateFilename?: string;
}

async function runVerification<TClaim>(
  handler: ClaimTypeHandler<TClaim>,
  input: RunVerificationInput<TClaim>,
): Promise<VerifyResponse> {
  if (input.file.byteLength === 0) {
    throw new VerificationError("INVALID_REQUEST", "Uploaded file is empty.");
  }

  let docExtraction: ExtractionResult;
  try {
    docExtraction = await extractDocument(input.file, input.filename || "upload.pdf");
  } catch (err) {
    throw new VerificationError(
      "EXTRACTION_UNAVAILABLE",
      `pdf-extractor call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let cocExtraction: ExtractionResult | undefined;
  if (input.certificateFile && input.certificateFile.byteLength > 0) {
    try {
      cocExtraction = await extractDocument(
        input.certificateFile,
        input.certificateFilename || "certificate.pdf",
      );
    } catch (err) {
      throw new VerificationError(
        "EXTRACTION_UNAVAILABLE",
        `pdf-extractor call failed on certificate: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const tampering = detectTampering(docExtraction, cocExtraction);
  const authenticity = checkAuthenticity(
    docExtraction,
    handler.buildAuthenticityInput(input.claim),
    cocExtraction,
  );
  const content = await handler.extractContent(docExtraction.text.content, input.claim);
  const { verdict, confidenceTier } = handler.computeVerdict({
    tampering,
    authenticity,
    content,
  });

  return {
    verdict,
    confidenceTier,
    signals: { tampering, authenticity, content },
    provenance: {
      fileHash: docExtraction.fileHash,
      certificateFileHash: cocExtraction?.fileHash,
      verifiedAt: new Date().toISOString(),
      verifier: handler.verifierName,
    },
  };
}
