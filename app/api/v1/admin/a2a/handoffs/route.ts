import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError } from "@/packages/contracts/src";
import { listAgentHandoffsByParentRunId } from "@/packages/persistence/src";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "inspect A2A handoffs");

    const parentRunId = request.nextUrl.searchParams.get("parentRunId")?.trim();

    if (!parentRunId) {
      throw new ApiError({
        errorCode: "VALIDATION_FAILED",
        status: 422,
        message: "parentRunId is required.",
        details: ["parentRunId"],
        correlationId,
      });
    }

    return successResponse(
      {
        handoffs: await listAgentHandoffsByParentRunId(parentRunId),
        parentRunId,
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
