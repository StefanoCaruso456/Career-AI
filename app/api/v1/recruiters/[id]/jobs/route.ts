import { type NextRequest } from "next/server";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { listAuthorizedRecruiterJobs } from "@/packages/recruiter-marketplace-domain/src";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { id } = await context.params;
    const jobs = await listAuthorizedRecruiterJobs({
      actor,
      correlationId,
      recruiterCareerIdentityId: id,
    });

    return successResponse(jobs, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
