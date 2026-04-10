import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { getJobsFeedSnapshot } from "@/packages/jobs-domain/src";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const snapshot = await getJobsFeedSnapshot({ limit });

    return successResponse(snapshot, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
