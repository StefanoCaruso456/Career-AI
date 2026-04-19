import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import {
  getCareerBuilderWorkspace,
  saveCareerBuilderPhase,
} from "@/packages/career-builder-domain/src";
import { ApiError, careerPhaseSchema } from "@/packages/contracts/src";
import { verifyEmploymentClaim } from "@/lib/api-gateway/client";
import type { OfferLetterVerificationEntry } from "@/lib/api-gateway/types";
import { findTalentIdentityByEmail } from "@/packages/identity-domain/src";
import { updateCareerBuilderEvidenceVerificationStatus } from "@/packages/persistence/src";

type RouteContext = {
  params: Promise<{
    phase: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user?.email) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "Sign in to save Career ID progress.",
        correlationId,
      });
    }

    const { phase: rawPhase } = await context.params;
    const phase = careerPhaseSchema.parse(rawPhase);
    const formData = await request.formData();
    const payload = JSON.parse(String(formData.get("payload") ?? "{}"));
    const uploadsByTemplateId: Record<string, { file: File; slot?: "front" | "back" }[]> = {};

    for (const [key, value] of formData.entries()) {
      if (!(value instanceof File) || !key.startsWith("upload:")) {
        continue;
      }

      const [, templateId, slot] = key.split(":");

      if (!templateId) {
        continue;
      }

      uploadsByTemplateId[templateId] ??= [];
      uploadsByTemplateId[templateId].push({
        file: value,
        slot: slot === "front" || slot === "back" ? slot : undefined,
      });
    }

    let snapshot = await saveCareerBuilderPhase({
      viewer: {
        email: session.user.email,
        name: session.user.name,
      },
      phase,
      input: payload,
      uploadsByTemplateId,
      correlationId,
    });

    // Best-effort synchronous verification for offer-letter uploads only.
    // Any failure here MUST NOT bubble up as a save failure — the evidence
    // is already persisted. We attach the outcome so the UI can render it.
    const offerLetterVerifications = await maybeVerifyOfferLetters({
      payload,
      uploadsByTemplateId,
      session,
      correlationId,
    });

    // If verification actually persisted a verdict, rebuild the snapshot so
    // the caller sees badges derived from the fresh verification_status
    // column without needing a page reload. Cheap — just re-reads the
    // current user's evidence rows.
    const verifiedOnSave = offerLetterVerifications?.some(
      (entry) => entry.outcome.ok && entry.outcome.result.status === "VERIFIED",
    );
    if (verifiedOnSave) {
      snapshot = await getCareerBuilderWorkspace({
        viewer: {
          email: session.user.email,
          name: session.user.name,
        },
        correlationId,
      });
    }

    return successResponse(
      {
        ...snapshot,
        offerLetterVerifications,
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

async function maybeVerifyOfferLetters(args: {
  payload: unknown;
  uploadsByTemplateId: Record<string, { file: File; slot?: "front" | "back" }[]>;
  session: { user?: { email?: string | null } | null };
  correlationId: string;
}): Promise<OfferLetterVerificationEntry[] | undefined> {
  const offerUploads = args.uploadsByTemplateId["offer-letters"];
  if (!offerUploads || offerUploads.length === 0) {
    return undefined;
  }

  // Pull the claim fields from the submitted evidence input. sourceOrIssuer
  // maps to employer, issuedOn maps to startDate, role is captured by its own
  // form input (required for offer-letters by the domain validator).
  const evidence = pickOfferLetterEvidence(args.payload);
  if (!evidence) {
    return undefined;
  }

  const claim = {
    employer: evidence.sourceOrIssuer,
    role: evidence.role,
    startDate: evidence.issuedOn,
  };

  const actorDid = `did:web:career-ai#${args.session.user?.email ?? "anonymous"}`;
  const results: OfferLetterVerificationEntry[] = [];

  for (const upload of offerUploads) {
    const buffer = new Uint8Array(await upload.file.arrayBuffer());
    const outcome = await verifyEmploymentClaim({
      file: buffer,
      filename: upload.file.name,
      claim,
      actorDid,
    });
    results.push({
      templateId: "offer-letters",
      filename: upload.file.name,
      outcome,
    });
  }

  // Persist the BEST verdict across all uploads onto the evidence record so
  // the badge derivation (and any reload) can pick it up. Rationale: a
  // single evidence row represents a set of files for one template — if any
  // of the files verified, the evidence as a whole is verified. Common case:
  // user uploads document (PARTIAL — envelope-stamp-only, no sender) + CoC
  // (VERIFIED — CoC has Envelope Originator domain matching employer).
  // Without this fix, DB would record PARTIAL because results[0] is the
  // document.
  const bestVerdict = pickBestVerdict(results);
  if (bestVerdict && args.session.user?.email) {
    try {
      const identity = await findTalentIdentityByEmail({
        email: args.session.user.email,
        correlationId: args.correlationId,
      });
      if (identity) {
        await updateCareerBuilderEvidenceVerificationStatus({
          careerIdentityId: identity.talentIdentity.id,
          templateId: "offer-letters",
          verificationStatus: bestVerdict,
        });
      }
    } catch (err) {
      console.warn(
        `[career-builder-save] failed to persist verification_status: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return results;
}

/**
 * Picks the highest-ranking verdict across all verification outcomes.
 * Priority: VERIFIED > PARTIAL > FAILED. Ignores non-ok outcomes
 * (UNCONFIGURED / UNAVAILABLE / GATEWAY_ERROR) — those mean the verifier
 * didn't produce a verdict, so the DB shouldn't be overwritten with one.
 * Returns null when no upload produced a usable verdict.
 */
function pickBestVerdict(
  results: OfferLetterVerificationEntry[],
): "VERIFIED" | "PARTIAL" | "FAILED" | null {
  const rank: Record<"VERIFIED" | "PARTIAL" | "FAILED", number> = {
    VERIFIED: 3,
    PARTIAL: 2,
    FAILED: 1,
  };
  let best: "VERIFIED" | "PARTIAL" | "FAILED" | null = null;
  for (const entry of results) {
    if (!entry.outcome.ok) continue;
    const status = entry.outcome.result.status;
    if (!best || rank[status] > rank[best]) {
      best = status;
    }
  }
  return best;
}

function pickOfferLetterEvidence(
  payload: unknown,
): { sourceOrIssuer: string; role: string; issuedOn: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const evidenceList = (payload as { evidence?: unknown }).evidence;
  if (!Array.isArray(evidenceList)) return null;
  const entry = evidenceList.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { templateId?: unknown }).templateId === "offer-letters",
  ) as { sourceOrIssuer?: unknown; role?: unknown; issuedOn?: unknown } | undefined;
  if (!entry) return null;
  if (typeof entry.sourceOrIssuer !== "string" || !entry.sourceOrIssuer.trim()) return null;
  if (typeof entry.role !== "string" || !entry.role.trim()) return null;
  if (typeof entry.issuedOn !== "string" || !entry.issuedOn.trim()) return null;
  return {
    sourceOrIssuer: entry.sourceOrIssuer,
    role: entry.role,
    issuedOn: entry.issuedOn,
  };
}
