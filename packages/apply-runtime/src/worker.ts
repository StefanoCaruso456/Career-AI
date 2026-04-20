import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { findPersistentContextByUserId } from "@/packages/persistence/src";
import {
  claimNextQueuedApplyRun,
  createApplyRunEventRecord,
  findApplyRunById,
  findProfileSnapshotById,
  updateApplyRunRecord,
} from "@/packages/persistence/src";
import {
  detectApplyTarget,
  greenhouseApplyAdapter,
  workdayApplyAdapter,
} from "@/packages/apply-adapters/src";
import type { ApplyAdapter } from "@/packages/apply-adapters/src";
import type {
  ApplyFailureCode,
  ApplyAtsFamily,
  ApplyRunDto,
  ApplyRunStatus,
  ApplyRunTerminalStatus,
  ApplicationProfileSnapshotDto,
} from "@/packages/contracts/src";
import { closeApplyBrowserSession, launchApplyBrowserSession, type ApplyBrowserSession } from "./browser-session";
import {
  cleanupExpiredApplyRunArtifacts,
  persistApplyRunScreenshot,
  persistApplyRunTextArtifact,
} from "./artifacts";
import type { PersistedApplyArtifact } from "./artifacts";
import {
  buildApplyRunnableConfig,
  extendApplyRunnableConfig,
  type ApplyTraceMetadata,
} from "./langsmith";
import { sendApplyRunTerminalEmail } from "./notifications";
import {
  getAutonomousApplyWorkerMode,
  getAutonomousApplyWorkerPollIntervalMs,
  getAutonomousApplyInlineWorkerConcurrency,
  getAutonomousApplyRunTimeoutMs,
  isAutonomousApplyArtifactCleanupEnabled,
  getAutonomousApplyWorkerBatchSize,
} from "@/packages/apply-domain/src";
import { emitApplyTraceLog, emitApplyTraceLogFromEvent } from "@/packages/apply-domain/src/trace";

const APPLY_GRAPH_VERSION = "2026-04-17";
const applyBrowserSessions = new Map<string, ApplyBrowserSession>();

const applyGraphStateSchema = new StateSchema({
  adapterId: z.string().nullable(),
  artifacts: z.array(z.any()).default([]),
  atsFamily: z
    .enum(["workday", "greenhouse", "lever", "generic_hosted_form", "unsupported_target"])
    .nullable(),
  browserSessionId: z.string().nullable(),
  companyName: z.string(),
  completedAt: z.string().datetime().nullable(),
  currentStep: z.string().nullable(),
  detectionConfidence: z.number().min(0).max(1).nullable(),
  failureCode: z
    .enum([
      "PROFILE_INCOMPLETE",
      "UNSUPPORTED_TARGET",
      "ATS_DETECTION_FAILED",
      "LOGIN_REQUIRED",
      "CAPTCHA_ENCOUNTERED",
      "REQUIRED_FIELD_UNMAPPED",
      "REQUIRED_DOCUMENT_MISSING",
      "FILE_UPLOAD_FAILED",
      "FORM_STRUCTURE_CHANGED",
      "SUBMIT_BLOCKED",
      "SUBMISSION_NOT_CONFIRMED",
      "NETWORK_FAILURE",
      "TIMEOUT",
      "UNKNOWN_RUNTIME_ERROR",
    ])
    .nullable(),
  failureMessage: z.string().nullable(),
  jobId: z.string(),
  jobPostingUrl: z.string().url(),
  jobTitle: z.string(),
  mappingPlan: z.any().nullable(),
  profileSnapshot: z.any().nullable(),
  profileSnapshotId: z.string(),
  runId: z.string(),
  submitAttempted: z.boolean().default(false),
  startedAt: z.string().datetime().nullable(),
  status: z.enum([
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
    "submitted",
    "submission_unconfirmed",
    "failed",
    "needs_attention",
    "completed",
  ]),
  traceId: z.string(),
  terminalState: z.enum(["submitted", "failed", "needs_attention", "submission_unconfirmed"]).nullable(),
  traceMetadata: z.record(z.string(), z.string()).default({}),
  userId: z.string(),
});

export type ApplyGraphState = {
  adapterId: string | null;
  artifacts: PersistedApplyArtifact[];
  atsFamily: ApplyAtsFamily | null;
  browserSessionId: string | null;
  companyName: string;
  completedAt: string | null;
  currentStep: string | null;
  detectionConfidence: number | null;
  failureCode: ApplyFailureCode | null;
  failureMessage: string | null;
  jobId: string;
  jobPostingUrl: string;
  jobTitle: string;
  mappingPlan: Awaited<ReturnType<ApplyAdapter["createMappingPlan"]>> | null;
  profileSnapshot: ApplicationProfileSnapshotDto | null;
  profileSnapshotId: string;
  runId: string;
  submitAttempted: boolean;
  startedAt: string | null;
  status: ApplyRunStatus;
  traceId: string;
  terminalState: ApplyRunTerminalStatus | null;
  traceMetadata: Record<string, string>;
  userId: string;
};

type RuntimeDependencies = {
  adapterRegistry: ApplyAdapter[];
  loadUserEmail: (userId: string) => Promise<string | null>;
};

const defaultDependencies: RuntimeDependencies = {
  adapterRegistry: [workdayApplyAdapter, greenhouseApplyAdapter],
  loadUserEmail: async (userId: string) => {
    const context = await findPersistentContextByUserId({
      correlationId: `apply-run-email:${userId}`,
      userId,
    });

    return context.user.email;
  },
};

let workerLoopActive = false;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getAdapterById(args: {
  adapterId: string | null;
  dependencies: RuntimeDependencies;
}) {
  if (!args.adapterId) {
    return null;
  }

  return args.dependencies.adapterRegistry.find((candidate) => candidate.id === args.adapterId) ?? null;
}

function getFallbackAdapter(args: {
  atsFamily: ApplyAtsFamily | null;
  dependencies: RuntimeDependencies;
}) {
  return (
    args.dependencies.adapterRegistry.find((candidate) => candidate.family === args.atsFamily) ??
    workdayApplyAdapter
  );
}

function getBrowserSession(runId: string) {
  return applyBrowserSessions.get(runId) ?? null;
}

async function loadRun(runId: string) {
  return findApplyRunById({
    runId,
  });
}

function shouldNeedsAttention(failureCode: ApplyFailureCode | null | undefined) {
  return failureCode === "LOGIN_REQUIRED" || failureCode === "CAPTCHA_ENCOUNTERED";
}

function toTraceMetadata(state: ApplyGraphState): ApplyTraceMetadata {
  return {
    adapterId: state.adapterId,
    atsFamily: state.atsFamily,
    companyName: state.companyName,
    failureCode: state.failureCode,
    graphVersion: APPLY_GRAPH_VERSION,
    jobId: state.jobId,
    jobTitle: state.jobTitle,
    profileSnapshotId: state.profileSnapshotId,
    runId: state.runId,
    traceId: state.traceId,
    terminalState: state.terminalState,
    userId: state.userId,
  };
}

function getCorrelationIdFromRun(run: Pick<ApplyRunDto, "metadataJson">) {
  const correlationId = run.metadataJson?.correlationId;

  return typeof correlationId === "string" && correlationId.length > 0 ? correlationId : null;
}

async function persistStateTransition(args: {
  state: ApplyGraphState;
  nextStatus: ApplyRunStatus;
  stepName: string;
  message: string;
  metadataJson?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const completedAt =
    args.nextStatus === "submitted" ||
    args.nextStatus === "failed" ||
    args.nextStatus === "needs_attention" ||
    args.nextStatus === "submission_unconfirmed" ||
    args.nextStatus === "completed"
      ? now
      : args.state.completedAt;
  const terminalState =
    args.nextStatus === "submitted" ||
    args.nextStatus === "failed" ||
    args.nextStatus === "needs_attention" ||
    args.nextStatus === "submission_unconfirmed"
      ? (args.nextStatus as ApplyRunTerminalStatus)
      : args.state.terminalState;

  await updateApplyRunRecord({
    adapterId: args.state.adapterId,
    atsFamily: args.state.atsFamily,
    completedAt,
    failureCode: args.state.failureCode,
    failureMessage: args.state.failureMessage,
    metadataPatch: args.metadataJson,
    runId: args.state.runId,
    startedAt: args.state.startedAt ?? now,
    status: args.nextStatus,
    terminalState,
    traceId: args.state.traceId,
  });
  const event = await createApplyRunEventRecord({
    event: {
      eventType: `apply_run.${args.stepName}`,
      message: args.message,
      metadataJson: args.metadataJson ?? {},
      runId: args.state.runId,
      traceId: args.state.traceId,
      state: args.nextStatus,
      stepName: args.stepName,
    },
  });
  emitApplyTraceLogFromEvent({
    companyName: args.state.companyName,
    correlationId: args.state.traceMetadata.correlationId ?? null,
    event,
    jobId: args.state.jobId,
    jobTitle: args.state.jobTitle,
    runId: args.state.runId,
  });
}

async function finalizeRun(args: {
  runId: string;
  status: ApplyRunStatus;
  terminalState: ApplyRunTerminalStatus;
  traceId: string;
  failureCode?: ApplyFailureCode | null;
  failureMessage?: string | null;
}) {
  await updateApplyRunRecord({
    completedAt: new Date().toISOString(),
    failureCode: args.failureCode ?? null,
    failureMessage: args.failureMessage ?? null,
    runId: args.runId,
    status: args.status,
    terminalState: args.terminalState,
    traceId: args.traceId,
  });
}

function buildGraph(dependencies: RuntimeDependencies) {
  const graph = new StateGraph(applyGraphStateSchema)
    .addNode("validate_profile_node", async (state: ApplyGraphState) => {
      if (!state.profileSnapshot) {
        throw new Error("Profile snapshot is required.");
      }

      await persistStateTransition({
        message: "Apply run preflight validation started.",
        nextStatus: "preflight_validating",
        state,
        stepName: "validate_profile_node",
      });

      return {
        startedAt: state.startedAt ?? new Date().toISOString(),
        status: "preflight_validating" as const,
      };
    })
    .addNode("snapshot_profile_node", async (state: ApplyGraphState) => {
      await persistStateTransition({
        message: "Immutable application profile snapshot attached to run.",
        nextStatus: "snapshot_created",
        state,
        stepName: "snapshot_profile_node",
      });

      return {
        status: "snapshot_created" as const,
      };
    })
    .addNode("resolve_target_node", async (state: ApplyGraphState) => {
      const detection = detectApplyTarget({
        jobPostingUrl: state.jobPostingUrl,
      });

      await persistStateTransition({
        message: `ATS target resolved as ${detection.atsFamily}.`,
        metadataJson: {
          confidence: detection.confidence,
          matchedRule: detection.matchedRule,
        },
        nextStatus: "detecting_target",
        state,
        stepName: "resolve_target_node",
      });

      if (detection.atsFamily === "unsupported_target") {
        return {
          atsFamily: detection.atsFamily,
          detectionConfidence: detection.confidence,
          failureCode: "UNSUPPORTED_TARGET" as const,
          failureMessage: "The target application is not supported by autonomous apply yet.",
          status: "failed" as const,
          terminalState: "failed" as const,
        };
      }

      return {
        atsFamily: detection.atsFamily,
        detectionConfidence: detection.confidence,
        status: "detecting_target" as const,
      };
    })
    .addNode("select_adapter_node", async (state: ApplyGraphState) => {
      const adapter =
        dependencies.adapterRegistry.find((candidate) =>
          candidate.canHandle({
            atsFamily: state.atsFamily ?? "unsupported_target",
            confidence: state.detectionConfidence ?? 0,
            fallbackStrategy: null,
            matchedRule: null,
          }),
        ) ?? null;

      if (!adapter) {
        return {
          failureCode: "UNSUPPORTED_TARGET" as const,
          failureMessage: "No autonomous apply adapter supports this target yet.",
          status: "failed" as const,
          terminalState: "failed" as const,
        };
      }

      await persistStateTransition({
        message: `Adapter ${adapter.id} selected.`,
        metadataJson: {
          adapterId: adapter.id,
          atsFamily: adapter.family,
        },
        nextStatus: "selecting_adapter",
        state: {
          ...state,
          adapterId: adapter.id,
        },
        stepName: "select_adapter_node",
      });

      return {
        adapterId: adapter.id,
        status: "selecting_adapter" as const,
      };
    })
    .addNode("preflight_adapter_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });

      if (!adapter || !state.profileSnapshot) {
        throw new Error("Apply runtime could not resolve the adapter preflight context.");
      }

      const run = await loadRun(state.runId);

      try {
        await adapter.preflight({
          run,
          runnableConfig: config,
          snapshot: state.profileSnapshot,
        });
      } catch (error) {
        const classification = await adapter.classifyFailure(
          {
            page: ({} as never),
            run,
            runnableConfig: config,
            session: ({} as never),
            snapshot: state.profileSnapshot,
          },
          error,
        ).catch(() => ({
          failureCode: "UNKNOWN_RUNTIME_ERROR" as const,
          message: error instanceof Error ? error.message : "Adapter preflight failed.",
        }));
        const nextStatus = shouldNeedsAttention(classification.failureCode)
          ? "needs_attention"
          : "preflight_failed";

        await persistStateTransition({
          message: "Adapter preflight failed.",
          metadataJson: {
            adapterId: adapter.id,
            failureCode: classification.failureCode,
          },
          nextStatus,
          state: {
            ...state,
            failureCode: classification.failureCode,
            failureMessage: classification.message,
            status: nextStatus,
            terminalState: shouldNeedsAttention(classification.failureCode)
              ? "needs_attention"
              : state.terminalState,
          },
          stepName: "preflight_adapter_node",
        });

        return {
          failureCode: classification.failureCode,
          failureMessage: classification.message,
          status: nextStatus,
          terminalState: shouldNeedsAttention(classification.failureCode)
            ? ("needs_attention" as const)
            : state.terminalState,
        };
      }

      await createApplyRunEventRecord({
        event: {
          eventType: "apply_run.preflight_adapter_node",
          message: "Adapter preflight passed.",
          metadataJson: {
            adapterId: adapter.id,
          },
          runId: state.runId,
          traceId: state.traceId,
          state: state.status,
          stepName: "preflight_adapter_node",
        },
      });

      return state;
    })
    .addNode("launch_browser_node", async (state: ApplyGraphState) => {
      const session = await launchApplyBrowserSession({
        runId: state.runId,
      });

      applyBrowserSessions.set(state.runId, session);

      await persistStateTransition({
        message: "Browser session launched.",
        metadataJson: {
          browserSessionId: session.sessionId,
        },
        nextStatus: "launching_browser",
        state,
        stepName: "launch_browser_node",
      });

      return {
        browserSessionId: session.sessionId,
        status: "launching_browser" as const,
      };
    })
    .addNode("open_target_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not resolve the adapter session context.");
      }

      await adapter.openTarget({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: extendApplyRunnableConfig(config, {
          metadata: {
            stepName: "open_target_node",
          },
        }),
        session,
        snapshot: state.profileSnapshot,
      });

      return state;
    })
    .addNode("analyze_form_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not analyze the target form.");
      }

      const fields = await adapter.analyzeForm({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      });

      await persistStateTransition({
        message: `Visible form analyzed with ${fields.length} fields.`,
        metadataJson: {
          fieldCount: fields.length,
        },
        nextStatus: "filling_form",
        state,
        stepName: "analyze_form_node",
      });

      return state;
    })
    .addNode("create_mapping_plan_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not create a mapping plan.");
      }

      const fields = await adapter.analyzeForm({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      });
      const mappingPlan = await adapter.createMappingPlan(
        {
          page: session.page,
          run: await loadRun(state.runId),
          runnableConfig: config,
          session,
          snapshot: state.profileSnapshot,
        },
        fields,
      );

      return {
        mappingPlan,
      };
    })
    .addNode("fill_form_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot || !state.mappingPlan) {
        throw new Error("Apply runtime could not fill the current form.");
      }

      await adapter.fillFields({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      }, state.mappingPlan);

      await persistStateTransition({
        message: "Visible form fields were filled.",
        nextStatus: "filling_form",
        state,
        stepName: "fill_form_node",
      });

      return {
        status: "filling_form" as const,
      };
    })
    .addNode("upload_documents_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not upload documents.");
      }

      await adapter.uploadDocuments({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      });

      await persistStateTransition({
        message: "Document upload step completed.",
        nextStatus: "uploading_documents",
        state,
        stepName: "upload_documents_node",
      });

      return {
        status: "uploading_documents" as const,
      };
    })
    .addNode("navigate_steps_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not navigate the form steps.");
      }

      await adapter.advanceSteps({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      });

      await persistStateTransition({
        message: "Application steps advanced.",
        nextStatus: "navigating_steps",
        state,
        stepName: "navigate_steps_node",
      });

      return {
        status: "navigating_steps" as const,
      };
    })
    .addNode("submit_application_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not submit the application.");
      }

      await adapter.submit({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      });

      await persistStateTransition({
        message: "Submit action executed.",
        nextStatus: "submitting",
        state,
        stepName: "submit_application_node",
      });

      return {
        submitAttempted: true,
        status: "submitting" as const,
      };
    })
    .addNode("confirm_submission_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not confirm submission.");
      }

      const result = await adapter.confirmSubmission({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      });

      if (!result.confirmed) {
        if (!state.submitAttempted) {
          return {
            failureCode: result.failureCode ?? "SUBMISSION_NOT_CONFIRMED",
            failureMessage: result.message,
            status: "failed" as const,
            terminalState: "failed" as const,
          };
        }

        return {
          failureCode: result.failureCode ?? "SUBMISSION_NOT_CONFIRMED",
          failureMessage: result.message,
          status: "submission_unconfirmed" as const,
          terminalState: "submission_unconfirmed" as const,
        };
      }

      return {
        failureCode: null,
        failureMessage: null,
        status: "submitted" as const,
        terminalState: "submitted" as const,
      };
    })
    .addNode("persist_artifacts_node", async (state: ApplyGraphState, config) => {
      const adapter = getAdapterById({
        adapterId: state.adapterId,
        dependencies,
      });
      const session = getBrowserSession(state.runId);

      if (!adapter || !session || !state.profileSnapshot) {
        throw new Error("Apply runtime could not persist artifacts.");
      }

      const collectedArtifacts = await adapter.collectArtifacts({
        page: session.page,
        run: await loadRun(state.runId),
        runnableConfig: config,
        session,
        snapshot: state.profileSnapshot,
      });
      const screenshot = await persistApplyRunScreenshot({
        artifactType: "screenshot_after_submit",
        label: "after-submit",
        page: session.page,
        runId: state.runId,
      });

      return {
        artifacts: [...state.artifacts, ...collectedArtifacts, screenshot],
      };
    })
    .addNode("send_notification_node", async (state: ApplyGraphState) => {
      const run = await loadRun(state.runId);
      const to = await dependencies.loadUserEmail(state.userId);
      await sendApplyRunTerminalEmail({
        run,
        to,
      });

      return state;
    })
    .addNode("finalize_success_node", async (state: ApplyGraphState) => {
      await finalizeRun({
        runId: state.runId,
        status: "submitted",
        terminalState: "submitted",
        traceId: state.traceId,
      });

      return {
        completedAt: new Date().toISOString(),
        status: "submitted" as const,
        terminalState: "submitted" as const,
      };
    })
    .addNode("finalize_failure_node", async (state: ApplyGraphState) => {
      const failureStatus = state.status === "needs_attention" ? "needs_attention" : "failed";

      await finalizeRun({
        failureCode: state.failureCode ?? "UNKNOWN_RUNTIME_ERROR",
        failureMessage: state.failureMessage ?? "Autonomous apply failed.",
        runId: state.runId,
        status: failureStatus,
        terminalState: failureStatus,
        traceId: state.traceId,
      });

      return {
        completedAt: new Date().toISOString(),
        status: failureStatus,
        terminalState: failureStatus,
      };
    })
    .addNode("finalize_unconfirmed_node", async (state: ApplyGraphState) => {
      await finalizeRun({
        failureCode: state.failureCode ?? "SUBMISSION_NOT_CONFIRMED",
        failureMessage: state.failureMessage ?? "Submission could not be confirmed.",
        runId: state.runId,
        status: "submission_unconfirmed",
        terminalState: "submission_unconfirmed",
        traceId: state.traceId,
      });

      return {
        completedAt: new Date().toISOString(),
        status: "submission_unconfirmed" as const,
        terminalState: "submission_unconfirmed" as const,
      };
    })
    .addNode("cleanup_node", async (state: ApplyGraphState) => {
      const session = getBrowserSession(state.runId);
      await closeApplyBrowserSession(session);
      applyBrowserSessions.delete(state.runId);

      return state;
    })
    .addEdge(START, "validate_profile_node")
    .addEdge("validate_profile_node", "snapshot_profile_node")
    .addEdge("snapshot_profile_node", "resolve_target_node")
    .addConditionalEdges("resolve_target_node", (state: ApplyGraphState) =>
      state.failureCode ? "finalize_failure_node" : "select_adapter_node",
    )
    .addConditionalEdges("select_adapter_node", (state: ApplyGraphState) =>
      state.failureCode ? "finalize_failure_node" : "preflight_adapter_node",
    )
    .addConditionalEdges("preflight_adapter_node", (state: ApplyGraphState) =>
      state.failureCode ? "finalize_failure_node" : "launch_browser_node",
    )
    .addEdge("launch_browser_node", "open_target_node")
    .addEdge("open_target_node", "analyze_form_node")
    .addEdge("analyze_form_node", "create_mapping_plan_node")
    .addEdge("create_mapping_plan_node", "fill_form_node")
    .addEdge("fill_form_node", "upload_documents_node")
    .addEdge("upload_documents_node", "navigate_steps_node")
    .addEdge("navigate_steps_node", "submit_application_node")
    .addEdge("submit_application_node", "confirm_submission_node")
    .addConditionalEdges("confirm_submission_node", (state: ApplyGraphState) => {
      if (state.terminalState === "submitted") {
        return "persist_artifacts_node";
      }

      if (state.terminalState === "submission_unconfirmed") {
        return "finalize_unconfirmed_node";
      }

      return "finalize_failure_node";
    })
    .addEdge("persist_artifacts_node", "finalize_success_node")
    .addEdge("finalize_success_node", "send_notification_node")
    .addEdge("finalize_failure_node", "send_notification_node")
    .addEdge("finalize_unconfirmed_node", "send_notification_node")
    .addEdge("send_notification_node", "cleanup_node")
    .addEdge("cleanup_node", END);

  return graph.compile();
}

async function invokeWithRunTimeout<T>(args: {
  invoke: () => Promise<T>;
  timeoutMs: number;
}) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      args.invoke(),
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Autonomous apply run exceeded timeout (${args.timeoutMs}ms).`));
        }, args.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function evaluateSafeRetryDecision(args: {
  classificationFailureCode: ApplyFailureCode;
  run: ApplyRunDto;
  submitAttempted: boolean;
}) {
  if (args.submitAttempted || args.run.status === "submitting" || args.run.terminalState === "submitted") {
    return {
      reason: "submit_attempted_or_terminal",
      shouldRetry: false,
    } as const;
  }

  // Inline worker mode intentionally avoids automatic retries for now to prevent
  // duplicate submissions in ambiguous browser states.
  return {
    reason: `automatic_retries_disabled_in_inline_mode:${args.classificationFailureCode}`,
    shouldRetry: false,
  } as const;
}

async function runSingleApplyRun(args: {
  dependencies?: RuntimeDependencies;
  run: ApplyRunDto;
}) {
  const dependencies = args.dependencies ?? defaultDependencies;
  const snapshot = await findProfileSnapshotById({
    snapshotId: args.run.profileSnapshotId,
  });
  const initialState: ApplyGraphState = {
    adapterId: args.run.adapterId,
    artifacts: [],
    atsFamily: args.run.atsFamily,
    browserSessionId: null,
    companyName: args.run.companyName,
    completedAt: args.run.completedAt,
    currentStep: null,
    detectionConfidence: null,
    failureCode: args.run.failureCode,
    failureMessage: args.run.failureMessage,
    jobId: args.run.jobId,
    jobPostingUrl: args.run.jobPostingUrl,
    jobTitle: args.run.jobTitle,
    mappingPlan: null,
    profileSnapshot: snapshot,
    profileSnapshotId: snapshot.id,
    runId: args.run.id,
    submitAttempted: false,
    startedAt: args.run.startedAt ?? new Date().toISOString(),
    status: args.run.status,
    traceId: args.run.traceId ?? `apply_trace_missing_${args.run.id}`,
    terminalState: args.run.terminalState,
    traceMetadata: {
      companyName: args.run.companyName,
      correlationId: getCorrelationIdFromRun(args.run) ?? "",
      jobId: args.run.jobId,
      jobTitle: args.run.jobTitle,
      profileSnapshotId: snapshot.id,
      runId: args.run.id,
      traceId: args.run.traceId ?? `apply_trace_missing_${args.run.id}`,
      userId: args.run.userId,
    },
    userId: args.run.userId,
  };
  const graph = buildGraph(dependencies);
  const runnableConfig = buildApplyRunnableConfig(toTraceMetadata(initialState));
  const workerClaimEvent = await createApplyRunEventRecord({
    event: {
      eventType: "apply_run.worker_claimed",
      message: "Worker claimed queued apply run.",
      metadataJson: {
        workerMode: getAutonomousApplyWorkerMode(),
      },
      runId: args.run.id,
      traceId: initialState.traceId,
      state: args.run.status,
      stepName: "worker_claimed",
    },
  });

  emitApplyTraceLogFromEvent({
    companyName: args.run.companyName,
    correlationId: getCorrelationIdFromRun(args.run),
    event: workerClaimEvent,
    jobId: args.run.jobId,
    jobTitle: args.run.jobTitle,
    runId: args.run.id,
  });

  try {
    await invokeWithRunTimeout({
      invoke: async () => graph.invoke(initialState, runnableConfig),
      timeoutMs: getAutonomousApplyRunTimeoutMs(),
    });
  } catch (error) {
    const session = getBrowserSession(args.run.id);

    if (session) {
      await persistApplyRunScreenshot({
        artifactType: "screenshot_failure",
        label: "failure",
        page: session.page,
        runId: args.run.id,
      }).catch(() => undefined);
      await persistApplyRunTextArtifact({
        artifactType: "json_debug",
        content: JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
        contentType: "application/json",
        fileName: "failure.json",
        runId: args.run.id,
      }).catch(() => undefined);
    }

    const latestRun = await loadRun(args.run.id).catch(() => args.run);
    const adapter =
      getAdapterById({
        adapterId: latestRun.adapterId,
        dependencies,
      }) ??
      getFallbackAdapter({
        atsFamily: latestRun.atsFamily,
        dependencies,
      });
    const classification = await adapter.classifyFailure(
      {
        page: session?.page ?? ({} as never),
        run: latestRun,
        runnableConfig,
        session: session ?? ({} as never),
        snapshot,
      },
      error,
    ).catch(() => ({
      failureCode: "UNKNOWN_RUNTIME_ERROR" as const,
      message: error instanceof Error ? error.message : "Unknown apply runtime error.",
    }));
    const retryDecision = evaluateSafeRetryDecision({
      classificationFailureCode: classification.failureCode,
      run: latestRun,
      submitAttempted:
        latestRun.status === "submitting" ||
        latestRun.status === "submitted" ||
        latestRun.status === "submission_unconfirmed",
    });
    const effectiveTraceId = latestRun.traceId ?? initialState.traceId;

    if (latestRun.terminalState) {
      const runtimeErrorAfterTerminalEvent = await createApplyRunEventRecord({
        event: {
          eventType: "apply_run.runtime_error_after_terminal",
          message: classification.message,
          metadataJson: {
            failureCode: classification.failureCode,
            retryDecision,
          },
          runId: args.run.id,
          traceId: effectiveTraceId,
          state: latestRun.status,
          stepName: "runtime_error_after_terminal",
        },
      }).catch(() => undefined);

      if (runtimeErrorAfterTerminalEvent) {
        emitApplyTraceLog({
          companyName: args.run.companyName,
          correlationId: getCorrelationIdFromRun(args.run),
          eventType: runtimeErrorAfterTerminalEvent.eventType,
          jobId: args.run.jobId,
          jobTitle: args.run.jobTitle,
          kind: "step",
          level: "error",
          message:
            runtimeErrorAfterTerminalEvent.message ??
            "Runtime error occurred after a terminal apply state.",
          metadataJson: runtimeErrorAfterTerminalEvent.metadataJson ?? {},
          name: "Handle post-terminal runtime error",
          parentSpanId: `${args.run.id}:phase:failure_handling`,
          phase: "failure_handling",
          runId: args.run.id,
          spanId: runtimeErrorAfterTerminalEvent.id,
          status: runtimeErrorAfterTerminalEvent.state,
          stepName: runtimeErrorAfterTerminalEvent.stepName,
          timestamp: runtimeErrorAfterTerminalEvent.timestamp,
          traceId: runtimeErrorAfterTerminalEvent.traceId ?? effectiveTraceId,
        });
      }

      await closeApplyBrowserSession(session).catch(() => undefined);
      applyBrowserSessions.delete(args.run.id);
      return;
    }

    await updateApplyRunRecord({
      completedAt: new Date().toISOString(),
      failureCode: classification.failureCode,
      failureMessage: classification.message,
      runId: args.run.id,
      status: shouldNeedsAttention(classification.failureCode) ? "needs_attention" : "failed",
      terminalState: shouldNeedsAttention(classification.failureCode) ? "needs_attention" : "failed",
      traceId: effectiveTraceId,
      metadataPatch: {
        retry_decision: retryDecision,
      },
    });
    const runtimeErrorEvent = await createApplyRunEventRecord({
      event: {
        eventType: "apply_run.runtime_error",
        message: classification.message,
        metadataJson: {
          failureCode: classification.failureCode,
          retryDecision,
        },
        runId: args.run.id,
        traceId: effectiveTraceId,
        state: shouldNeedsAttention(classification.failureCode) ? "needs_attention" : "failed",
        stepName: "runtime_error",
      },
    });
    emitApplyTraceLog({
      companyName: args.run.companyName,
      correlationId: getCorrelationIdFromRun(args.run),
      eventType: runtimeErrorEvent.eventType,
      jobId: args.run.jobId,
      jobTitle: args.run.jobTitle,
      kind: "step",
      level: "error",
      message: runtimeErrorEvent.message ?? classification.message,
      metadataJson: runtimeErrorEvent.metadataJson ?? {},
      name: "Handle runtime error",
      parentSpanId: `${args.run.id}:phase:failure_handling`,
      phase: "failure_handling",
      runId: args.run.id,
      spanId: runtimeErrorEvent.id,
      status: runtimeErrorEvent.state,
      stepName: runtimeErrorEvent.stepName,
      timestamp: runtimeErrorEvent.timestamp,
      traceId: runtimeErrorEvent.traceId ?? effectiveTraceId,
    });

    const to = await dependencies.loadUserEmail(args.run.userId).catch(() => null);
    const updatedRun = await loadRun(args.run.id);
    await sendApplyRunTerminalEmail({
      run: updatedRun,
      to,
    }).catch(() => undefined);
    await closeApplyBrowserSession(session).catch(() => undefined);
    applyBrowserSessions.delete(args.run.id);
  }
}
export async function runAutonomousApplyWorkerCycle(args?: {
  dependencies?: RuntimeDependencies;
}) {
  const claimedRun = await claimNextQueuedApplyRun();

  if (!claimedRun) {
    return null;
  }

  await runSingleApplyRun({
    dependencies: args?.dependencies,
    run: claimedRun,
  });

  return claimedRun.id;
}

async function processAutonomousApplyWorkerBatch(args?: {
  dependencies?: RuntimeDependencies;
}) {
  const batchSize = getAutonomousApplyWorkerBatchSize();
  const concurrency = getAutonomousApplyInlineWorkerConcurrency();
  let processedCount = 0;

  while (processedCount < batchSize) {
    const availableSlots = Math.min(concurrency, batchSize - processedCount);
    const claims = await Promise.all(
      Array.from({
        length: availableSlots,
      }).map(() =>
        runAutonomousApplyWorkerCycle({
          dependencies: args?.dependencies,
        }),
      ),
    );
    const claimedCount = claims.filter((value): value is string => Boolean(value)).length;

    processedCount += claimedCount;

    if (claimedCount === 0) {
      break;
    }
  }

  return processedCount;
}

export async function kickAutonomousApplyWorker(args?: {
  dependencies?: RuntimeDependencies;
}) {
  if (getAutonomousApplyWorkerMode() !== "inline" || workerLoopActive) {
    return;
  }

  workerLoopActive = true;

  queueMicrotask(async () => {
    try {
      if (isAutonomousApplyArtifactCleanupEnabled()) {
        await cleanupExpiredApplyRunArtifacts().catch(() => undefined);
      }

      await processAutonomousApplyWorkerBatch(args);
    } finally {
      workerLoopActive = false;
    }
  });
}

export async function runAutonomousApplyWorkerLoop(args?: {
  dependencies?: RuntimeDependencies;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}) {
  const pollIntervalMs = args?.pollIntervalMs ?? getAutonomousApplyWorkerPollIntervalMs();

  while (!args?.signal?.aborted) {
    if (isAutonomousApplyArtifactCleanupEnabled()) {
      await cleanupExpiredApplyRunArtifacts().catch(() => undefined);
    }

    const processedCount = await processAutonomousApplyWorkerBatch({
      dependencies: args?.dependencies,
    });

    if (processedCount === 0) {
      await sleep(pollIntervalMs);
    }
  }
}
