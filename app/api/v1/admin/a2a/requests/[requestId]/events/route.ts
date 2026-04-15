import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { listAgentTaskEventsByRequestId } from "@/packages/persistence/src";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "inspect A2A lifecycle history");

    const { requestId } = await context.params;

    return successResponse(
      {
        events: await listAgentTaskEventsByRequestId(requestId),
        requestId,
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
