import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { listAccessControlOverview } from "@/packages/admin-ops/src";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "view access-control operations");

    return successResponse(
      await listAccessControlOverview({
        correlationId,
      }),
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
