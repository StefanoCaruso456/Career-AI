import { type NextRequest } from "next/server";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { recruiterAccessRequestInputSchema } from "@/packages/contracts/src";
import { requestRecruiterAccess } from "@/packages/recruiter-marketplace-domain/src";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const payload = recruiterAccessRequestInputSchema.parse(await request.json());
    const { id } = await context.params;
    const grant = await requestRecruiterAccess({
      actor,
      correlationId,
      recruiterCareerIdentityId: id,
      requestMessageOptional: payload.requestMessage,
      requestedScopes: payload.requestedScopes,
    });

    return successResponse({ grant }, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
