import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { AUTONOMOUS_APPLY_QUEUED_MESSAGE } from "@/lib/jobs/apply-run-messages";
import {
  createAutonomousApplyRun,
  getAutonomousApplyAvailability,
  getAutonomousApplyStuckInProgressThresholdMinutes,
  getAutonomousApplyStuckQueuedThresholdMinutes,
  resolveAutonomousApplyDecision,
  toAutonomousApplyUnavailableApiError,
} from "@/packages/apply-domain/src";
import {
  applyContinuationResponseSchema,
  applyRunListResponseSchema,
  createApplyRunInputSchema,
  ApiError,
  type ApplyRunDto,
  type ApplyRunStatus,
  type ApplyRunStatusItem,
} from "@/packages/contracts/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { kickAutonomousApplyWorker } from "@/packages/apply-runtime/src";
import { getJobPostingDetails } from "@/packages/jobs-domain/src";
import {
  isDatabaseConfigured,
  listApplyRunEventSummariesByRunIds,
  listApplyRunsByUser,
} from "@/packages/persistence/src";

export const runtime = "nodejs";

const inProgressStatuses = new Set<ApplyRunStatus>([
  "created",
  "queued",
  "preflight_validating",
  "preflight_failed",
  "snapshot_created",
  "detecting_target",
  "selecting_adapter",
  "launching_browser",
  "auth_required",
  "filling_form",
  "uploading_documents",
  "navigating_steps",
  "submitting",
]);

function toStuckThresholdsMs() {
  return {
    inProgress: getAutonomousApplyStuckInProgressThresholdMinutes() * 60_000,
    queued: getAutonomousApplyStuckQueuedThresholdMinutes() * 60_000,
  };
}

function toAlertableState(args: {
  nowMs: number;
  run: ApplyRunDto;
}): ApplyRunStatusItem["alertableState"] {
  if (args.run.terminalState) {
    return null;
  }

  const thresholds = toStuckThresholdsMs();
  const createdMs = new Date(args.run.createdAt).getTime();
  const startedMs = args.run.startedAt ? new Date(args.run.startedAt).getTime() : null;

  if (args.run.status === "queued" && args.nowMs - createdMs >= thresholds.queued) {
    return "stuck_queued";
  }

  if (
    inProgressStatuses.has(args.run.status) &&
    args.run.status !== "queued" &&
    args.nowMs - (startedMs ?? createdMs) >= thresholds.inProgress
  ) {
    return "stuck_in_progress";
  }

  return null;
}

function toTimelineSummary(
  summary: Awaited<ReturnType<typeof listApplyRunEventSummariesByRunIds>>[number] | undefined,
): ApplyRunStatusItem["timelineSummary"] {
  return {
    latestEventType: summary?.latestEventType ?? null,
    latestTimestamp: summary?.latestTimestamp ?? null,
    totalEvents: summary?.totalEvents ?? 0,
  };
}

function toStatusItem(args: {
  nowMs: number;
  run: ApplyRunDto;
  summary: Awaited<ReturnType<typeof listApplyRunEventSummariesByRunIds>>[number] | undefined;
}): ApplyRunStatusItem {
  return {
    alertableState: toAlertableState({
      nowMs: args.nowMs,
      run: args.run,
    }),
    companyName: args.run.companyName,
    completedAt: args.run.completedAt,
    createdAt: args.run.createdAt,
    failureCode: args.run.failureCode,
    failureMessage: args.run.failureMessage,
    id: args.run.id,
    jobTitle: args.run.jobTitle,
    startedAt: args.run.startedAt,
    status: args.run.status,
    terminalState: args.run.terminalState,
    timelineSummary: toTimelineSummary(args.summary),
    traceId: args.run.traceId,
  };
}

type AuthenticatedSessionUser = {
  appUserId: string;
  authProvider?: string | null;
  email?: string | null;
  image?: string | null;
  name?: string | null;
  providerUserId?: string | null;
};

async function requireSessionUser(correlationId: string): Promise<AuthenticatedSessionUser> {
  const session = await auth();

  if (!session?.user) {
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

  if (!session.user.appUserId) {
    throw new ApiError({
      correlationId,
      details: {
        diagnostic_reason: "auth_missing",
      },
      errorCode: "UNAUTHORIZED",
      message: "A persistent Career AI user is required.",
      status: 401,
    });
  }

  return {
    appUserId: session.user.appUserId,
    authProvider: session.user.authProvider,
    email: session.user.email,
    image: session.user.image,
    name: session.user.name,
    providerUserId: session.user.providerUserId,
  };
}

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const user = await requireSessionUser(correlationId);
    const limit = Number.parseInt(
      request.nextUrl.searchParams.get("limit")?.trim() || "20",
      10,
    );

    if (!isDatabaseConfigured()) {
      return successResponse(
        applyRunListResponseSchema.parse({
          generatedAt: new Date().toISOString(),
          items: [],
        }),
        correlationId,
      );
    }

    const runs = await listApplyRunsByUser({
      limit: Number.isFinite(limit) ? limit : 20,
      userId: user.appUserId,
    });
    const summaries = await listApplyRunEventSummariesByRunIds({
      runIds: runs.map((run) => run.id),
    });
    const summaryByRunId = new Map(summaries.map((entry) => [entry.runId, entry]));
    const nowMs = Date.now();

    return successResponse(
      applyRunListResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        items: runs.map((run) =>
          toStatusItem({
            nowMs,
            run,
            summary: summaryByRunId.get(run.id),
          }),
        ),
      }),
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const user = await requireSessionUser(correlationId);
    const input = createApplyRunInputSchema.parse(await request.json());
    const job = await getJobPostingDetails({
      jobId: input.jobId,
    });
    const targetApplyUrl =
      input.canonicalApplyUrl ?? job?.canonicalApplyUrl ?? job?.applyUrl ?? null;
    const availability = getAutonomousApplyAvailability();
    const routingDecision = resolveAutonomousApplyDecision({
      autonomousApplyEnabled: true,
      applyTarget: job?.applyTarget ?? null,
      targetApplyUrl,
    });

    if (routingDecision.action === "open_external") {
      return successResponse(
        applyContinuationResponseSchema.parse({
          action: "open_external",
          applyUrl: targetApplyUrl,
          diagnostic: {
            atsFamily: routingDecision.detection?.atsFamily ?? null,
            diagnosticReason: routingDecision.diagnosticReason,
            matchedRule: routingDecision.detection?.matchedRule ?? null,
          },
          ok: true,
        }),
        correlationId,
      );
    }

    if (!availability.canQueueRuns) {
      throw toAutonomousApplyUnavailableApiError({
        availability,
        correlationId,
      });
    }

    const result = await createAutonomousApplyRun({
      correlationId,
      input,
      sessionUser: {
        appUserId: user.appUserId,
        authProvider: user.authProvider,
        email: user.email,
        emailVerified: true,
        image: user.image,
        name: user.name,
        providerUserId: user.providerUserId,
      },
    });

    void kickAutonomousApplyWorker();

    return successResponse(
      applyContinuationResponseSchema.parse({
        action: "queued",
        applyRunId: result.run.id,
        diagnostic: {
          atsFamily: routingDecision.detection.atsFamily,
          diagnosticReason: routingDecision.diagnosticReason,
          matchedRule: routingDecision.detection.matchedRule,
        },
        message: AUTONOMOUS_APPLY_QUEUED_MESSAGE,
        ok: true,
      }),
      correlationId,
      201,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
