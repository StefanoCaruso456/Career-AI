import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { searchJobsInputSchema } from "@/packages/contracts/src";
import { searchJobsPanel } from "@/packages/jobs-domain/src";
import { resolveChatRouteContext } from "@/app/api/chat/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { ownerId } = await resolveChatRouteContext(request);
    const payload = searchJobsInputSchema.parse(await request.json());
    const response = await searchJobsPanel({
      conversationId: payload.conversationId ?? null,
      limit: payload.limit,
      origin: payload.origin ?? "api",
      ownerId,
      prompt: payload.prompt,
      refresh: payload.refresh ?? false,
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
