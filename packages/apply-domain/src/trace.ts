import type {
  ApplyRunDto,
  ApplyRunEventDto,
  ApplyRunStatus,
  ApplyRunTraceTree,
  ApplyTraceLogLevel,
  ApplyTraceLogRecord,
  ApplyTraceNode,
  ApplyTraceNodeKind,
  ApplyTracePhase,
} from "@/packages/contracts/src";
import {
  applyRunTraceTreeSchema,
  applyTraceLogSchema,
} from "@/packages/contracts/src";

const APPLY_TRACE_TREE_VERSION = "career_ai.apply_trace_tree.v1" as const;
const APPLY_TRACE_LOG_SCHEMA = "career_ai.apply_trace_log.v1" as const;

const PHASE_ORDER: ApplyTracePhase[] = [
  "queue",
  "preflight",
  "target_resolution",
  "browser_launch",
  "form_mapping",
  "form_interaction",
  "submission",
  "artifacts",
  "completion",
  "notification",
  "cleanup",
  "failure_handling",
  "other",
];

const PHASE_LABELS: Record<ApplyTracePhase, string> = {
  artifacts: "Artifact capture",
  browser_launch: "Browser launch",
  cleanup: "Cleanup",
  completion: "Completion",
  failure_handling: "Failure handling",
  form_interaction: "Form interaction",
  form_mapping: "Form mapping",
  notification: "Notification",
  other: "Other",
  preflight: "Preflight",
  queue: "Queue",
  routing: "Routing",
  submission: "Submission",
  target_resolution: "Target resolution",
};

const STEP_LABELS: Record<string, string> = {
  analyze_form_node: "Analyze visible form",
  cleanup_node: "Cleanup browser session",
  confirm_submission_node: "Confirm submission",
  create_mapping_plan_node: "Create mapping plan",
  fill_form_node: "Fill form fields",
  finalize_failure_node: "Finalize failure",
  finalize_success_node: "Finalize success",
  finalize_unconfirmed_node: "Finalize unconfirmed submission",
  launch_browser_node: "Launch browser",
  navigate_steps_node: "Advance application steps",
  open_target_node: "Open target application",
  persist_artifacts_node: "Persist runtime artifacts",
  preflight_adapter_node: "Run adapter preflight",
  resolve_target_node: "Resolve ATS target",
  runtime_error: "Handle runtime error",
  runtime_error_after_terminal: "Handle post-terminal runtime error",
  select_adapter_node: "Select adapter",
  send_notification_node: "Send terminal notification",
  snapshot_profile_node: "Attach profile snapshot",
  start_apply_run: "Create queued apply run",
  submit_application_node: "Submit application",
  upload_documents_node: "Upload documents",
  validate_profile_node: "Validate reusable profile",
  worker_claimed: "Worker claimed run",
};

function toDurationMs(startedAt: string, endedAt: string | null) {
  if (!endedAt) {
    return null;
  }

  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < startedAtMs) {
    return null;
  }

  return Math.round(endedAtMs - startedAtMs);
}

function getStepDisplayName(stepName: string | null, eventType: string | null) {
  if (stepName && STEP_LABELS[stepName]) {
    return STEP_LABELS[stepName];
  }

  if (stepName) {
    return stepName
      .replace(/_/g, " ")
      .replace(/\b\w/g, (segment) => segment.toUpperCase());
  }

  if (eventType) {
    return eventType;
  }

  return "Apply trace step";
}

function sortEvents(events: ApplyRunEventDto[]) {
  return [...events].sort((left, right) =>
    new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

export function resolveApplyTracePhase(args: {
  eventType?: string | null;
  stepName?: string | null;
}): ApplyTracePhase {
  switch (args.stepName) {
    case "start_apply_run":
    case "worker_claimed":
      return "queue";
    case "validate_profile_node":
    case "snapshot_profile_node":
    case "preflight_adapter_node":
      return "preflight";
    case "resolve_target_node":
    case "select_adapter_node":
      return "target_resolution";
    case "launch_browser_node":
    case "open_target_node":
      return "browser_launch";
    case "analyze_form_node":
    case "create_mapping_plan_node":
      return "form_mapping";
    case "fill_form_node":
    case "upload_documents_node":
    case "navigate_steps_node":
      return "form_interaction";
    case "submit_application_node":
    case "confirm_submission_node":
      return "submission";
    case "persist_artifacts_node":
      return "artifacts";
    case "finalize_success_node":
      return "completion";
    case "send_notification_node":
      return "notification";
    case "cleanup_node":
      return "cleanup";
    case "finalize_failure_node":
    case "finalize_unconfirmed_node":
    case "runtime_error":
    case "runtime_error_after_terminal":
      return "failure_handling";
    default:
      if (args.eventType === "apply_run.created") {
        return "queue";
      }

      return "other";
  }
}

function buildStepNode(args: {
  event: ApplyRunEventDto;
  nextTimestamp: string | null;
  runId: string;
}) {
  const phase = resolveApplyTracePhase({
    eventType: args.event.eventType,
    stepName: args.event.stepName,
  });

  return {
    children: [],
    durationMs: toDurationMs(args.event.timestamp, args.nextTimestamp),
    endedAt: args.nextTimestamp,
    eventType: args.event.eventType,
    id: args.event.id,
    kind: "step" as const,
    message: args.event.message,
    metadataJson: args.event.metadataJson ?? {},
    name: getStepDisplayName(args.event.stepName, args.event.eventType),
    parentId: `${args.runId}:phase:${phase}`,
    phase,
    startedAt: args.event.timestamp,
    status: args.event.state,
    stepName: args.event.stepName,
    traceId: args.event.traceId ?? null,
  } satisfies ApplyTraceNode;
}

function buildPhaseNode(args: {
  nodes: ApplyTraceNode[];
  phase: ApplyTracePhase;
  run: Pick<ApplyRunDto, "id" | "traceId">;
}) {
  const firstNode = args.nodes[0];
  const lastNode = args.nodes.at(-1) ?? firstNode;
  const endedAt = lastNode.endedAt ?? lastNode.startedAt;

  return {
    children: args.nodes,
    durationMs: toDurationMs(firstNode.startedAt, endedAt),
    endedAt,
    eventType: null,
    id: `${args.run.id}:phase:${args.phase}`,
    kind: "phase" as const,
    message: null,
    metadataJson: {
      eventCount: args.nodes.length,
    },
    name: PHASE_LABELS[args.phase],
    parentId: args.run.id,
    phase: args.phase,
    startedAt: firstNode.startedAt,
    status: lastNode.status,
    stepName: null,
    traceId: args.run.traceId ?? null,
  } satisfies ApplyTraceNode;
}

export function buildApplyRunTraceTree(args: {
  events: ApplyRunEventDto[];
  run: Pick<
    ApplyRunDto,
    "companyName" | "completedAt" | "createdAt" | "id" | "jobTitle" | "status" | "traceId"
  >;
}): ApplyRunTraceTree {
  const events = sortEvents(args.events);
  const stepNodes = events.map((event, index) =>
    buildStepNode({
      event,
      nextTimestamp:
        events[index + 1]?.timestamp ??
        args.run.completedAt ??
        null,
      runId: args.run.id,
    }),
  );
  const phaseNodes = PHASE_ORDER.flatMap((phase) => {
    const nodes = stepNodes.filter((node) => node.phase === phase);

    if (nodes.length === 0) {
      return [];
    }

    return [
      buildPhaseNode({
        nodes,
        phase,
        run: args.run,
      }),
    ];
  });
  const endedAt =
    args.run.completedAt ??
    phaseNodes.at(-1)?.endedAt ??
    stepNodes.at(-1)?.endedAt ??
    null;

  return applyRunTraceTreeSchema.parse({
    root: {
      children: phaseNodes,
      durationMs: toDurationMs(args.run.createdAt, endedAt),
      endedAt,
      eventType: null,
      id: args.run.id,
      kind: "run",
      message: null,
      metadataJson: {
        phaseCount: phaseNodes.length,
        stepCount: stepNodes.length,
      },
      name: `${args.run.companyName} · ${args.run.jobTitle}`,
      parentId: null,
      phase: "other",
      startedAt: args.run.createdAt,
      status: args.run.status,
      stepName: null,
      traceId: args.run.traceId ?? null,
    },
    version: APPLY_TRACE_TREE_VERSION,
  });
}

export function createApplyTraceLogRecord(args: {
  companyName?: string | null;
  correlationId?: string | null;
  eventType?: string | null;
  jobId?: string | null;
  jobTitle?: string | null;
  kind: ApplyTraceNodeKind;
  level?: ApplyTraceLogLevel;
  message: string;
  metadataJson?: Record<string, unknown>;
  name: string;
  parentSpanId?: string | null;
  phase: ApplyTracePhase;
  runId?: string | null;
  spanId: string;
  status?: string | null;
  stepName?: string | null;
  timestamp?: string;
  traceId?: string | null;
}): ApplyTraceLogRecord {
  return applyTraceLogSchema.parse({
    companyName: args.companyName ?? null,
    correlationId: args.correlationId ?? null,
    jobId: args.jobId ?? null,
    jobTitle: args.jobTitle ?? null,
    level: args.level ?? "info",
    message: args.message,
    metadataJson: args.metadataJson ?? {},
    runId: args.runId ?? null,
    schema: APPLY_TRACE_LOG_SCHEMA,
    span: {
      eventType: args.eventType ?? null,
      id: args.spanId,
      kind: args.kind,
      name: args.name,
      parentId: args.parentSpanId ?? null,
      phase: args.phase,
      status: args.status ?? null,
      stepName: args.stepName ?? null,
    },
    timestamp: args.timestamp ?? new Date().toISOString(),
    traceId: args.traceId ?? null,
  });
}

export function emitApplyTraceLog(args: Parameters<typeof createApplyTraceLogRecord>[0]) {
  const record = createApplyTraceLogRecord(args);
  const serialized = JSON.stringify(record);

  if (record.level === "error") {
    console.error(serialized);
  } else {
    console.info(serialized);
  }

  return record;
}

export function emitApplyTraceLogFromEvent(args: {
  companyName: string;
  correlationId?: string | null;
  event: ApplyRunEventDto;
  jobId: string;
  jobTitle: string;
  runId: string;
}) {
  const phase = resolveApplyTracePhase({
    eventType: args.event.eventType,
    stepName: args.event.stepName,
  });

  return emitApplyTraceLog({
    companyName: args.companyName,
    correlationId: args.correlationId ?? null,
    eventType: args.event.eventType,
    jobId: args.jobId,
    jobTitle: args.jobTitle,
    kind: "step",
    message: args.event.message ?? getStepDisplayName(args.event.stepName, args.event.eventType),
    metadataJson: args.event.metadataJson ?? {},
    name: getStepDisplayName(args.event.stepName, args.event.eventType),
    parentSpanId: `${args.runId}:phase:${phase}`,
    phase,
    runId: args.runId,
    spanId: args.event.id,
    status: args.event.state,
    stepName: args.event.stepName,
    timestamp: args.event.timestamp,
    traceId: args.event.traceId ?? null,
  });
}
