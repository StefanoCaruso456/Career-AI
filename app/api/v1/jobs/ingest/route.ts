import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { getJobsFeedSnapshot } from "@/packages/jobs-domain/src";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const payload = (await request.json().catch(() => ({}))) as {
      limit?: number;
      windowDays?: number;
    };
    const snapshot = await getJobsFeedSnapshot({
      forceRefresh: true,
      limit: payload.limit,
      windowDays: payload.windowDays,
    });

    return successResponse(
      {
        generatedAt: snapshot.generatedAt,
        jobs: snapshot.jobs.length,
        sources: snapshot.sources.length,
        storage: snapshot.storage,
        summary: snapshot.summary,
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
