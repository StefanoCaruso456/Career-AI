import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { validateJobsInputSchema } from "@/packages/contracts/src";
import { validateJobsCatalog } from "@/packages/jobs-domain/src";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const payload = validateJobsInputSchema.parse(await request.json());
    const jobs = await validateJobsCatalog({
      jobIds: payload.jobIds,
      limit: payload.limit,
    });

    return successResponse(
      {
        jobs,
        summary: {
          activeVerified: jobs.filter((job) => job.validationStatus === "active_verified").length,
          activeUnverified: jobs.filter((job) => job.validationStatus === "active_unverified").length,
          invalid: jobs.filter((job) => job.validationStatus === "invalid").length,
          stale: jobs.filter((job) => job.validationStatus === "stale").length,
          total: jobs.length,
        },
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
