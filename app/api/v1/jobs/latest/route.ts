import { type NextRequest } from "next/server";
import {
  browseLatestJobsInputSchema,
} from "@/packages/contracts/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { browseLatestJobsPanel } from "@/packages/jobs-domain/src";
import { resolveChatRouteContext } from "@/app/api/chat/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { ownerId } = await resolveChatRouteContext(request);
    const payload = browseLatestJobsInputSchema.parse(await request.json());
    const response = await browseLatestJobsPanel({
      conversationId: payload.conversationId ?? null,
      limit: payload.limit,
      ownerId,
      refresh: payload.refresh ?? false,
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
