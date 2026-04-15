import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError } from "@/packages/contracts/src";
import { getAgentRunRecordById } from "@/packages/persistence/src";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "inspect A2A run");

    const { runId } = await context.params;
    const run = await getAgentRunRecordById(runId);

    if (!run) {
      throw new ApiError({
        errorCode: "NOT_FOUND",
        status: 404,
        message: "A2A run not found.",
        details: {
          runId,
        },
        correlationId,
      });
    }

    return successResponse({ run }, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
