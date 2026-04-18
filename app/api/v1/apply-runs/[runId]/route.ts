import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  applyRunDetailResponseSchema,
  applyRunStatusItemSchema,
  ApiError,
} from "@/packages/contracts/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import {
  findApplyRunById,
  listApplyRunEventSummariesByRunIds,
  listApplyRunEvents,
} from "@/packages/persistence/src";
import {
  getAutonomousApplyStuckInProgressThresholdMinutes,
  getAutonomousApplyStuckQueuedThresholdMinutes,
} from "@/packages/apply-domain/src";

export const runtime = "nodejs";

function toAlertableState(args: {
  nowMs: number;
  run: Awaited<ReturnType<typeof findApplyRunById>>;
}) {
  if (args.run.terminalState) {
    return null;
  }

  const queuedThresholdMs = getAutonomousApplyStuckQueuedThresholdMinutes() * 60_000;
  const inProgressThresholdMs = getAutonomousApplyStuckInProgressThresholdMinutes() * 60_000;
  const createdMs = new Date(args.run.createdAt).getTime();
  const startedMs = args.run.startedAt ? new Date(args.run.startedAt).getTime() : createdMs;

  if (args.run.status === "queued" && args.nowMs - createdMs >= queuedThresholdMs) {
    return "stuck_queued" as const;
  }

  if (
    args.run.status !== "queued" &&
    !args.run.terminalState &&
    args.nowMs - startedMs >= inProgressThresholdMs
  ) {
    return "stuck_in_progress" as const;
  }

  return null;
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      runId: string;
    }>;
  },
) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user?.appUserId) {
      throw new ApiError({
        correlationId,
        details: {
          diagnostic_reason: "auth_missing",
        },
        errorCode: "UNAUTHORIZED",
        message: "A signed-in session is required.",
        status: 401,
      });
    }

    const params = await context.params;
    const run = await findApplyRunById({
      runId: params.runId,
    }).catch(() => null);

    if (!run) {
      throw new ApiError({
        correlationId,
        details: null,
        errorCode: "NOT_FOUND",
        message: "Apply run not found.",
        status: 404,
      });
    }

    if (run.userId !== session.user.appUserId) {
      throw new ApiError({
        correlationId,
        details: null,
        errorCode: "NOT_FOUND",
        message: "Apply run not found.",
        status: 404,
      });
    }

    const [events, summaries] = await Promise.all([
      listApplyRunEvents({
        runId: run.id,
      }),
      listApplyRunEventSummariesByRunIds({
        runIds: [run.id],
      }),
    ]);
    const summary = summaries[0];
    const nowMs = Date.now();

    return successResponse(
      applyRunDetailResponseSchema.parse({
        events,
        generatedAt: new Date().toISOString(),
        run: applyRunStatusItemSchema.parse({
          alertableState: toAlertableState({
            nowMs,
            run,
          }),
          companyName: run.companyName,
          completedAt: run.completedAt,
          createdAt: run.createdAt,
          failureCode: run.failureCode,
          failureMessage: run.failureMessage,
          id: run.id,
          jobTitle: run.jobTitle,
          startedAt: run.startedAt,
          status: run.status,
          terminalState: run.terminalState,
          timelineSummary: {
            latestEventType: summary?.latestEventType ?? null,
            latestTimestamp: summary?.latestTimestamp ?? null,
            totalEvents: summary?.totalEvents ?? 0,
          },
          traceId: run.traceId,
        }),
      }),
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
