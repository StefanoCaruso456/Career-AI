import { type NextRequest } from "next/server";
import { z } from "zod";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { rejectVerificationRecord } from "@/packages/verification-domain/src";

const rejectVerificationInputSchema = z.object({
  reason: z.string().trim().min(1),
  reviewerActorId: z.string().trim().min(1),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "reject verification records");
    const { id } = await context.params;
    const body = rejectVerificationInputSchema.parse(await request.json());
    const record = rejectVerificationRecord({
      verificationRecordId: id,
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
