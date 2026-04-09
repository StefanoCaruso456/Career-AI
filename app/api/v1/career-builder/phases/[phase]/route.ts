import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { saveCareerBuilderPhase } from "@/packages/career-builder-domain/src";
import { ApiError, careerPhaseSchema } from "@/packages/contracts/src";

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

    return successResponse(snapshot, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
