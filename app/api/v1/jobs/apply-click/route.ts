import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  createAutonomousApplyRun,
  getAutonomousApplyAvailability,
  resolveAutonomousApplyDecision,
  toAutonomousApplyUnavailableApiError,
} from "@/packages/apply-domain/src";
import { kickAutonomousApplyWorker } from "@/packages/apply-runtime/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { applyContinuationResponseSchema, createApplyRunInputSchema, ApiError } from "@/packages/contracts/src";
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
    const targetApplyUrl =
      payload.canonicalApplyUrl ?? job?.canonicalApplyUrl ?? job?.applyUrl ?? null;
    const availability = getAutonomousApplyAvailability();
    const routingDecision = resolveAutonomousApplyDecision({
      autonomousApplyEnabled: true,
      applyTarget: job?.applyTarget ?? null,
      targetApplyUrl,
    });
    const isSupportedAutonomousTarget =
      routingDecision.action === "queue_autonomous_apply";
    const routingAction =
      isSupportedAutonomousTarget && !availability.canQueueRuns
        ? "autonomous_apply_unavailable"
        : routingDecision.action;
    const routingDiagnosticReason =
      isSupportedAutonomousTarget && !availability.canQueueRuns
        ? availability.diagnosticReason
        : routingDecision.diagnosticReason;

    console.info("autonomous_apply_click_routing", {
      applyTargetAtsFamily: job?.applyTarget?.atsFamily ?? null,
      applyTargetSupportStatus: job?.applyTarget?.supportStatus ?? null,
      autonomousApplyBlobStorageDriver: availability.blobStorageDriver,
      autonomousApplyCanQueueRuns: availability.canQueueRuns,
      autonomousApplySystemDiagnosticReason: availability.diagnosticReason,
      autonomousApplyWorkerMode: availability.workerMode,
      correlationId,
      jobFound: Boolean(job),
      jobId: payload.jobId,
      routingAction,
      routingDiagnosticReason,
      targetApplyUrl,
    });

    if (isDatabaseConfigured()) {
      await recordJobApplyClickEvent({
        canonicalApplyUrl:
          payload.canonicalApplyUrl ?? job?.canonicalApplyUrl ?? job?.applyUrl ?? "",
        conversationId: payload.conversationId ?? null,
        jobId: payload.jobId,
        metadata: {
          autonomous_apply_blob_storage_driver: availability.blobStorageDriver,
          autonomous_apply_diagnostic_reason: routingDiagnosticReason,
          autonomous_apply_system_can_queue_runs: availability.canQueueRuns,
          autonomous_apply_system_diagnostic_reason: availability.diagnosticReason,
          autonomous_apply_target_ats_family: routingDecision.detection?.atsFamily ?? null,
          autonomous_apply_worker_mode: availability.workerMode,
          ...(payload.metadata ?? {}),
        },
        ownerId,
      });
    }

    if (isSupportedAutonomousTarget && !availability.canQueueRuns) {
      throw toAutonomousApplyUnavailableApiError({
        availability,
        correlationId,
      });
    }

    if (routingDecision.action === "queue_autonomous_apply") {
      const session = await auth();

      if (!session?.user) {
        throw new ApiError({
          correlationId,
          details: {
            diagnostic_reason: "auth_missing",
          },
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
        applyContinuationResponseSchema.parse({
          action: "queued",
          applyRunId: result.run.id,
          diagnostic: {
            atsFamily: routingDecision.detection.atsFamily,
            diagnosticReason: routingDecision.diagnosticReason,
            matchedRule: routingDecision.detection.matchedRule,
          },
          message: "Your application was queued. We will email you when it finishes.",
          ok: true,
        }),
        correlationId,
        201,
      );
    }

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
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
