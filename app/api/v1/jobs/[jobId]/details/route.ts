import { type NextRequest, NextResponse } from "next/server";
import { getCorrelationId } from "@/packages/audit-security/src";
import {
  jobDetailsResponseSchema,
  type JobDetailsResponseDto,
} from "@/packages/contracts/src";
import { getJobDetails } from "@/packages/jobs-domain/src";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export const dynamic = "force-dynamic";

function createErrorResponse(
  correlationId: string,
  error: JobDetailsResponseDto["error"],
  status: number,
) {
  return NextResponse.json(
    jobDetailsResponseSchema.parse({
      error,
      success: false,
    }),
    {
      headers: {
        "x-correlation-id": correlationId,
      },
      status,
    },
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { jobId } = await context.params;
    const details = await getJobDetails({
      jobId,
    });

    return NextResponse.json(
      jobDetailsResponseSchema.parse({
        data: details,
        success: true,
      }),
      {
        headers: {
          "x-correlation-id": correlationId,
        },
        status: 200,
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Job details could not be loaded right now.";
    const status = /could not be found/i.test(message) ? 404 : 500;

    return createErrorResponse(
      correlationId,
      {
        code: status === 404 ? "JOB_DETAILS_NOT_FOUND" : "JOB_DETAILS_UNAVAILABLE",
        message,
      },
      status,
    );
  }
}
