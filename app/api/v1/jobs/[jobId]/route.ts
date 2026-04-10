import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { getJobPostingDetails } from "@/packages/jobs-domain/src";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      jobId: string;
    }>;
  },
) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { jobId } = await context.params;
    const job = await getJobPostingDetails({
      jobId,
    });

    return successResponse({ job }, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
