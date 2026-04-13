import { type NextRequest } from "next/server";
import { addProvenanceInputSchema } from "@/packages/contracts/src";
import {
  assertReviewerAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { addProvenanceRecord } from "@/packages/verification-domain/src";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertReviewerAccess(actor, correlationId, "attach provenance");
    const { id } = await context.params;
    const body = addProvenanceInputSchema.parse(await request.json());
    const record = addProvenanceRecord({
      verificationRecordId: id,
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
