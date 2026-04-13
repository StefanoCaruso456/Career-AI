import { type NextRequest } from "next/server";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { getClaimAuditTrail } from "@/packages/admin-ops/src";

type RouteContext = {
  params: Promise<{
    claimId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "view claim audit trails");
    const { claimId } = await context.params;
    const trail = await getClaimAuditTrail({
      claimId,
      correlationId,
    });

    return successResponse(trail, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
