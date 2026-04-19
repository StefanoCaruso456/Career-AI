import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { saveCareerBuilderPhase } from "@/packages/career-builder-domain/src";
import { ApiError, careerPhaseSchema } from "@/packages/contracts/src";
import { verifyEmploymentClaim } from "@/lib/api-gateway/client";
import type { OfferLetterVerificationEntry } from "@/lib/api-gateway/types";

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

    const snapshot = await saveCareerBuilderPhase({
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
    });

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

  return results;
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
