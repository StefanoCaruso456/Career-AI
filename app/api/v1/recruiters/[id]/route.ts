import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { getRecruiterProfileForDiscovery } from "@/packages/recruiter-marketplace-domain/src";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { id } = await context.params;
    const recruiter = await getRecruiterProfileForDiscovery({
      correlationId,
      recruiterCareerIdentityId: id,
    });

    return successResponse({ recruiter }, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
