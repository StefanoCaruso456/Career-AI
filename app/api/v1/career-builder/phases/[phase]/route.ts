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
import { buildActorDid, verifyClaim, type ClaimKind } from "@/lib/api-gateway/client";
import type {
  ClaimVerificationEntry,
  OfferLetterVerificationEntry,
} from "@/lib/api-gateway/types";
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

    // Best-effort synchronous verification for every claim-backed template
    // the user uploaded (offer-letter, employment-verification, education,
    // transcript). Failures here MUST NOT bubble up as save failures —
    // evidence is already persisted. Outcomes attach to the response.
    const claimVerifications = await verifyAllClaimUploads({
      payload,
      uploadsByTemplateId,
      session,
      correlationId,
    });

    // If any verification actually persisted a verdict (VERIFIED or
    // PARTIAL), rebuild the snapshot so the caller sees the fresh card
    // pill / badge derived from verification_status without needing a
    // page reload.
    const anyVerdictLanded = claimVerifications.some(
      (entry) =>
        entry.outcome.ok &&
        (entry.outcome.result.status === "VERIFIED" ||
          entry.outcome.result.status === "PARTIAL"),
    );
    if (anyVerdictLanded) {
      snapshot = await getCareerBuilderWorkspace({
        viewer: {
          email: session.user.email,
          name: session.user.name,
        },
        correlationId,
      });
    }

    const offerLetterVerifications = claimVerifications.filter(
      (entry): entry is OfferLetterVerificationEntry =>
        entry.templateId === "offer-letters",
    );
    const offerLetterRecord = snapshot.evidence.find(
      (e) => e.templateId === "offer-letters",
    );
    console.log(
      `[career-builder-save cid=${correlationId}] outbound snapshot offer-letter verificationStatus=${offerLetterRecord?.verificationStatus ?? "null"} (rebuilt=${anyVerdictLanded ? "yes" : "no"})`,
    );

    return successResponse(
      {
        ...snapshot,
        claimVerifications,
        offerLetterVerifications, // back-compat for UI that keys on the offer-letter-only shape
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

/**
 * Per-template wiring: how to pull the claim payload out of the save
 * input and which gateway claim-type handler to call. Each evidence
 * template that can produce a verified badge registers one entry.
 */
interface ClaimTemplateConfig {
  templateId:
    | "offer-letters"
    | "employment-history-reports"
    | "diplomas-degrees"
    | "transcripts";
  kind: ClaimKind;
  /**
   * Extract the handler-specific claim payload from the evidence entry.
   * Returns null when required fields are missing — that skips
   * verification for this upload set without failing the save.
   */
  buildClaim: (params: {
    evidence: {
      sourceOrIssuer: string;
      role: string;
      issuedOn: string;
    };
    session: { user?: { name?: string | null } | null };
  }) => unknown | null;
}

const CLAIM_TEMPLATE_CONFIGS: ClaimTemplateConfig[] = [
  {
    templateId: "offer-letters",
    kind: "offer-letter",
    buildClaim: ({ evidence, session }) => {
      if (!evidence.sourceOrIssuer || !evidence.role || !evidence.issuedOn) return null;
      return {
        employer: evidence.sourceOrIssuer,
        role: evidence.role,
        startDate: evidence.issuedOn,
        userAccountName: session.user?.name ?? undefined,
      };
    },
  },
  {
    templateId: "employment-history-reports",
    kind: "employment-verification",
    buildClaim: ({ evidence, session }) => {
      if (!evidence.sourceOrIssuer || !evidence.role) return null;
      return {
        employer: evidence.sourceOrIssuer,
        role: evidence.role,
        startDate: evidence.issuedOn || undefined,
        userAccountName: session.user?.name ?? undefined,
      };
    },
  },
  {
    templateId: "diplomas-degrees",
    kind: "education",
    buildClaim: ({ evidence, session }) => {
      if (!evidence.sourceOrIssuer || !evidence.role || !evidence.issuedOn) return null;
      return {
        institution: evidence.sourceOrIssuer,
        degree: evidence.role,
        graduationDate: evidence.issuedOn,
        userAccountName: session.user?.name ?? undefined,
      };
    },
  },
  {
    templateId: "transcripts",
    kind: "transcript",
    buildClaim: ({ evidence, session }) => {
      if (!evidence.sourceOrIssuer) return null;
      return {
        institution: evidence.sourceOrIssuer,
        program: evidence.role || undefined,
        academicPeriod: evidence.issuedOn || undefined,
        userAccountName: session.user?.name ?? undefined,
      };
    },
  },
];

async function verifyAllClaimUploads(args: {
  payload: unknown;
  uploadsByTemplateId: Record<string, { file: File; slot?: "front" | "back" }[]>;
  session: { user?: { email?: string | null; name?: string | null } | null };
  correlationId: string;
}): Promise<ClaimVerificationEntry[]> {
  const logPrefix = `[career-builder-save cid=${args.correlationId}]`;
  const uploadSummary = Object.entries(args.uploadsByTemplateId)
    .map(([tid, files]) => `${tid}=${files.length}`)
    .join(",");
  console.log(
    `${logPrefix} incoming uploads by template: ${uploadSummary || "(none)"}`,
  );
  const results: ClaimVerificationEntry[] = [];
  for (const config of CLAIM_TEMPLATE_CONFIGS) {
    const templateResults = await verifyTemplateUploads(config, args);
    results.push(...templateResults);
  }
  return results;
}

async function verifyTemplateUploads(
  config: ClaimTemplateConfig,
  args: {
    payload: unknown;
    uploadsByTemplateId: Record<string, { file: File; slot?: "front" | "back" }[]>;
    session: { user?: { email?: string | null; name?: string | null } | null };
    correlationId: string;
  },
): Promise<ClaimVerificationEntry[]> {
  const logPrefix = `[career-builder-save cid=${args.correlationId}]`;
  const uploads = args.uploadsByTemplateId[config.templateId];
  if (!uploads || uploads.length === 0) {
    console.log(
      `${logPrefix} ${config.templateId}: skipping verify — no files in upload map`,
    );
    return [];
  }

  const evidence = pickEvidenceEntry(args.payload, config.templateId);
  if (!evidence) {
    console.log(
      `${logPrefix} ${config.templateId}: skipping verify — no matching evidence entry in payload (files=${uploads.length})`,
    );
    return [];
  }

  const claim = config.buildClaim({ evidence, session: args.session });
  if (claim === null) {
    console.log(
      `${logPrefix} ${config.templateId}: skipping verify — buildClaim returned null. evidence fields: sourceOrIssuer=${JSON.stringify(evidence.sourceOrIssuer)}, role=${JSON.stringify(evidence.role)}, issuedOn=${JSON.stringify(evidence.issuedOn)}`,
    );
    return [];
  }
  console.log(
    `${logPrefix} ${config.templateId}: dispatching verify (kind=${config.kind}, files=${uploads.length})`,
  );

  const actorDid = buildActorDid(args.session.user?.email);
  const results: ClaimVerificationEntry[] = [];

  for (const upload of uploads) {
    const buffer = new Uint8Array(await upload.file.arrayBuffer());
    const outcome = await verifyClaim({
      kind: config.kind,
      file: buffer,
      filename: upload.file.name,
      claim,
      actorDid,
    });
    results.push({
      templateId: config.templateId,
      filename: upload.file.name,
      outcome,
    });
  }

  const bestVerdict = pickBestVerdict(results);
  console.log(
    `${logPrefix} ${config.templateId} verification summary: files=${results.length}, bestVerdict=${bestVerdict ?? "none"}, outcomes=${results
      .map((r) =>
        r.outcome.ok ? r.outcome.result.status : `ERR:${r.outcome.reason}`,
      )
      .join(",")}`,
  );

  if (bestVerdict && args.session.user?.email) {
    try {
      const identity = await findTalentIdentityByEmail({
        email: args.session.user.email,
        correlationId: args.correlationId,
      });
      if (!identity) {
        console.warn(
          `${logPrefix} no talent identity found for email; cannot persist verification_status`,
        );
      } else {
        const rowCount = await updateCareerBuilderEvidenceVerificationStatus({
          careerIdentityId: identity.talentIdentity.id,
          templateId: config.templateId,
          // Scope to the specific evidence row just upserted. With the
          // widened (user, template, sourceOrIssuer, role) uniqueness
          // key a user can own multiple rows per template, so we must
          // target only the one matching this claim.
          sourceOrIssuer: evidence.sourceOrIssuer,
          role: evidence.role,
          verificationStatus: bestVerdict,
        });
        console.log(
          `${logPrefix} persisted verification_status=${bestVerdict} template=${config.templateId} employer=${evidence.sourceOrIssuer} role=${evidence.role} careerIdentityId=${identity.talentIdentity.id} rowsAffected=${rowCount}`,
        );
      }
    } catch (err) {
      console.warn(
        `${logPrefix} failed to persist verification_status for ${config.templateId}: ${err instanceof Error ? `${err.message}\n${err.stack}` : String(err)}`,
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
  results: ClaimVerificationEntry[],
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

/**
 * Pulls a single evidence entry out of the saved payload by templateId.
 * Returns null when the entry is missing or lacks the generic fields
 * (sourceOrIssuer / role / issuedOn) the verification flow depends on.
 * Each claim template config is responsible for checking whether the
 * fields it actually needs are present before building a claim.
 */
function pickEvidenceEntry(
  payload: unknown,
  templateId: string,
): { sourceOrIssuer: string; role: string; issuedOn: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const evidenceList = (payload as { evidence?: unknown }).evidence;
  if (!Array.isArray(evidenceList)) return null;
  const entry = evidenceList.find(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as { templateId?: unknown }).templateId === templateId,
  ) as { sourceOrIssuer?: unknown; role?: unknown; issuedOn?: unknown } | undefined;
  if (!entry) return null;
  return {
    sourceOrIssuer: typeof entry.sourceOrIssuer === "string" ? entry.sourceOrIssuer : "",
    role: typeof entry.role === "string" ? entry.role : "",
    issuedOn: typeof entry.issuedOn === "string" ? entry.issuedOn : "",
  };
}
