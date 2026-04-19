import { type NextRequest } from "next/server";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { recruiterCareerMatchInputSchema } from "@/packages/contracts/src";
import { matchRecruiterJobsAgainstSeekerCareerId } from "@/packages/recruiter-marketplace-domain/src";

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
    const payload = recruiterCareerMatchInputSchema.parse(await request.json());
    const { id } = await context.params;
    const response = await matchRecruiterJobsAgainstSeekerCareerId({
      actor,
      correlationId,
      limit: payload.limit,
      recruiterCareerIdentityId: id,
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
