import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { getJobsFeedSnapshot } from "@/packages/jobs-domain/src";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const rawWindowDays = request.nextUrl.searchParams.get("windowDays");
    const rawRefresh = request.nextUrl.searchParams.get("refresh");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;
    const parsedWindowDays = rawWindowDays ? Number.parseInt(rawWindowDays, 10) : undefined;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const windowDays = Number.isFinite(parsedWindowDays) ? parsedWindowDays : undefined;
    const forceRefresh = rawRefresh === "1" || rawRefresh === "true";
    const snapshot = await getJobsFeedSnapshot({ limit, windowDays, forceRefresh });

    return successResponse(snapshot, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
