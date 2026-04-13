import { type NextRequest } from "next/server";
import { getRecruiterPrivateCandidateProfile } from "@/packages/access-request-domain/src";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";

type RouteContext = {
  params: Promise<{
    candidateId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { candidateId } = await context.params;
    const response = await getRecruiterPrivateCandidateProfile({
      actor,
      correlationId,
      subjectTalentIdentityId: candidateId,
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
