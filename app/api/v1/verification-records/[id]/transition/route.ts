import { type NextRequest } from "next/server";
import { verificationTransitionInputSchema } from "@/packages/contracts/src";
import {
  assertReviewerAccess,
  errorResponse,
  getAuthenticatedActor,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { transitionVerificationRecord } from "@/packages/verification-domain/src";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = getAuthenticatedActor(request.headers, correlationId);
    assertReviewerAccess(actor, correlationId, "transition verification records");
    const { id } = await context.params;
    const body = verificationTransitionInputSchema.parse(await request.json());
    const record = transitionVerificationRecord({
      verificationRecordId: id,
      targetStatus: body.targetStatus,
      reason: body.reason,
      reviewerActorId: body.reviewerActorId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(record, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
