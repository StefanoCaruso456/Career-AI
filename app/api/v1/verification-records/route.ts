import { type NextRequest } from "next/server";
import { createVerificationRecordInputSchema } from "@/packages/contracts/src";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { createVerificationRecord } from "@/packages/verification-domain/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "create verification records");
    const body = createVerificationRecordInputSchema.parse(await request.json());
    const record = createVerificationRecord({
      input: body,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(record, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
