import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getAuthenticatedActor,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { listPendingReviewQueue } from "@/packages/admin-ops/src";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = getAuthenticatedActor(request.headers, correlationId);
    assertReviewerAccess(actor, correlationId, "list review queue items");

    return successResponse(
      {
        items: listPendingReviewQueue({
          correlationId,
        }),
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
