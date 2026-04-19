import { type NextRequest } from "next/server";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { getAuthorizedRecruiterJob } from "@/packages/recruiter-marketplace-domain/src";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    jobId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { id, jobId } = await context.params;
    const job = await getAuthorizedRecruiterJob({
      actor,
      correlationId,
      jobId,
      recruiterCareerIdentityId: id,
    });

    return successResponse({ job }, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
