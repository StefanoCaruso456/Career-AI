import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { createAutonomousApplyRun, isAutonomousApplyEnabled } from "@/packages/apply-domain/src";
import { kickAutonomousApplyWorker } from "@/packages/apply-runtime/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { createApplyRunInputSchema, ApiError } from "@/packages/contracts/src";
import { getJobPostingDetails } from "@/packages/jobs-domain/src";
import { isDatabaseConfigured, recordJobApplyClickEvent } from "@/packages/persistence/src";
import { resolveChatRouteContext } from "@/app/api/chat/route-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { ownerId } = await resolveChatRouteContext(request);
    const payload = createApplyRunInputSchema.parse(await request.json());
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

    if (isAutonomousApplyEnabled()) {
      const session = await auth();

      if (!session?.user) {
        throw new ApiError({
          correlationId,
          details: null,
          errorCode: "UNAUTHORIZED",
          message: "A signed-in session is required to start autonomous apply.",
          status: 401,
        });
      }

      const result = await createAutonomousApplyRun({
        correlationId,
        input: payload,
        sessionUser: {
          appUserId: session.user.appUserId,
          authProvider: session.user.authProvider,
          email: session.user.email,
          emailVerified: true,
          image: session.user.image,
          name: session.user.name,
          providerUserId: session.user.providerUserId,
        },
      });

      void kickAutonomousApplyWorker();

      return successResponse(
        {
          action: "queued",
          applyRunId: result.run.id,
          message: "Your application was queued. We will email you when it finishes.",
          ok: true,
        },
        correlationId,
        201,
      );
    }

    return successResponse(
      {
        action: "open_external",
        applyUrl: job?.canonicalApplyUrl ?? job?.applyUrl ?? payload.canonicalApplyUrl ?? null,
        ok: true,
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
