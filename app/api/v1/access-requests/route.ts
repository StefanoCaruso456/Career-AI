import { type NextRequest } from "next/server";
import { createAccessRequestInputSchema } from "@/packages/contracts/src";
import {
  createScopedAccessRequest,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const payload = createAccessRequestInputSchema.parse(await request.json());
    const accessRequest = await createScopedAccessRequest({
      actor,
      correlationId,
      justification: payload.justification,
      organizationId: payload.organizationId,
      scope: payload.scope,
      subjectTalentIdentityId: payload.subjectTalentIdentityId,
    });

    return successResponse(accessRequest, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
