import { type NextRequest } from "next/server";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { getRecruiterTrustProfileByToken } from "@/packages/recruiter-read-model/src";

type RouteContext = {
  params: Promise<{
    shareProfileKey: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId, {
      allowPublic: true,
    });
    const { shareProfileKey } = await context.params;
    const profile = await getRecruiterTrustProfileByToken({
      token: shareProfileKey,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
      baseUrlOptional: request.nextUrl.origin,
    });

    return successResponse(profile, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
