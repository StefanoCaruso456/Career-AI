import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { recordJobApplyClickInputSchema } from "@/packages/contracts/src";
import { getJobPostingDetails } from "@/packages/jobs-domain/src";
import { isDatabaseConfigured, recordJobApplyClickEvent } from "@/packages/persistence/src";
import { resolveChatRouteContext } from "@/app/api/chat/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { ownerId } = await resolveChatRouteContext(request);
    const payload = recordJobApplyClickInputSchema.parse(await request.json());
    const job = await getJobPostingDetails({
      jobId: payload.jobId,
    });

    if (isDatabaseConfigured()) {
      await recordJobApplyClickEvent({
        canonicalApplyUrl:
          payload.canonicalApplyUrl ?? job?.canonicalApplyUrl ?? job?.applyUrl ?? "",
        conversationId: payload.conversationId ?? null,
        jobId: payload.jobId,
        metadata: payload.metadata,
        ownerId,
      });
    }

    return successResponse(
      {
        applyUrl: job?.canonicalApplyUrl ?? job?.applyUrl ?? payload.canonicalApplyUrl ?? null,
        ok: true,
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
