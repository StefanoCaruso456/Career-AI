import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError } from "@/packages/contracts/src";
import { getAgentMessageRecordById } from "@/packages/persistence/src";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "inspect A2A message");

    const { messageId } = await context.params;
    const message = await getAgentMessageRecordById(messageId);

    if (!message) {
      throw new ApiError({
        errorCode: "NOT_FOUND",
        status: 404,
        message: "A2A message not found.",
        details: {
          messageId,
        },
        correlationId,
      });
    }

    return successResponse({ message }, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
