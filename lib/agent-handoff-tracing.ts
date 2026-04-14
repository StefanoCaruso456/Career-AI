import { traceSpan } from "@/lib/tracing";

type JsonRecord = Record<string, unknown>;
type TraceMetricRecord = Record<string, number>;
type TraceSpanType = "function" | "llm" | "task";

export type AgentHandoffEvent =
  | "start"
  | "authz"
  | "dispatch"
  | "complete"
  | "denied";

export type AgentHandoffMetadata = {
  a2aProtocolVersion?: string | null;
  a2aRequestId?: string | null;
  authSubject?: string | null;
  childRunId?: string | null;
  handoffReason: string;
  handoffType: string;
  operation: string;
  parentRunId?: string | null;
  permissionDecision?: string | null;
  sourceAgentType?: string | null;
  sourceEndpoint?: string | null;
  targetAgentType: string;
  targetEndpoint: string;
  taskStatus?: string | null;
};

function compactRecord(record: JsonRecord) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined),
  );
}

function buildTags(metadata: AgentHandoffMetadata, tags: string[] = []) {
  return [
    "agent_handoff",
    `handoff:${metadata.handoffType}`,
    `target_agent:${metadata.targetAgentType}`,
    ...tags,
  ];
}

export function buildAgentHandoffMetadata(metadata: AgentHandoffMetadata): JsonRecord {
  return compactRecord({
    a2a_protocol_version: metadata.a2aProtocolVersion,
    a2a_request_id: metadata.a2aRequestId,
    auth_subject: metadata.authSubject,
    child_run_id: metadata.childRunId,
    handoff_reason: metadata.handoffReason,
    handoff_type: metadata.handoffType,
    operation: metadata.operation,
    parent_run_id: metadata.parentRunId,
    permission_decision: metadata.permissionDecision,
    source_agent_type: metadata.sourceAgentType,
    source_endpoint: metadata.sourceEndpoint,
    target_agent_type: metadata.targetAgentType,
    target_endpoint: metadata.targetEndpoint,
    task_status: metadata.taskStatus,
  });
}

export function emitAgentHandoffEvent(args: {
  event: AgentHandoffEvent;
  input?: unknown;
  metadata: AgentHandoffMetadata;
  output?: unknown;
  tags?: string[];
  type?: TraceSpanType;
}) {
  return traceSpan(
    {
      input: args.input,
      metadata: buildAgentHandoffMetadata(args.metadata),
      name: `agent.handoff.${args.event}`,
      output: args.output,
      tags: buildTags(args.metadata, args.tags),
      type: args.type ?? "task",
    },
    () => args.output ?? null,
  );
}

type AgentHandoffTraceArgs<TResult> = {
  event: AgentHandoffEvent;
  input?: unknown;
  invoke: () => Promise<TResult>;
  metadata: AgentHandoffMetadata;
  metrics?: TraceMetricRecord | ((result: TResult) => TraceMetricRecord | undefined);
  output?: unknown | ((result: TResult) => unknown);
  tags?: string[];
  type?: TraceSpanType;
};

export function traceAgentHandoff<TResult>(args: AgentHandoffTraceArgs<TResult>) {
  return traceSpan(
    {
      input: args.input,
      metadata: buildAgentHandoffMetadata(args.metadata),
      metrics: args.metrics,
      name: `agent.handoff.${args.event}`,
      output: args.output,
      tags: buildTags(args.metadata, args.tags),
      type: args.type ?? "task",
    },
    args.invoke,
  );
}
