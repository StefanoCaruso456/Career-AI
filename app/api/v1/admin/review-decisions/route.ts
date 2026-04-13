import { type NextRequest } from "next/server";
import { reviewDecisionInputSchema } from "@/packages/contracts/src";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { submitReviewDecision } from "@/packages/admin-ops/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "submit review decisions");
    const body = reviewDecisionInputSchema.parse(await request.json());
    const decision = submitReviewDecision({
      input: body,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(decision, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
