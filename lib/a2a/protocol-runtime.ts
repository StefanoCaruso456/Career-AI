import { traceSpan } from "@/lib/tracing";
import {
  createAgentTaskEventRecord,
  upsertAgentHandoffRecord,
  upsertAgentMessageRecord,
  upsertAgentRunRecord,
} from "@/packages/persistence/src";
import type { AgentId, A2ATaskLifecycleStatus, ExternalAgentProtocolVersion } from "@/packages/contracts/src";

type JsonRecord = Record<string, unknown>;

export type A2AProtocolContext = {
  authJson?: JsonRecord;
  completedAt?: string | null;
  contextJson?: JsonRecord;
  conversationId?: string | null;
  deadlineAt?: string | null;
  handoffId?: string | null;
  handoffMetadata?: JsonRecord;
  handoffStatus?: A2ATaskLifecycleStatus | null;
  handoffType?: string | null;
  idempotencyKey?: string | null;
  messageId: string;
  operation: string;
  parentRunId?: string | null;
  payloadJson?: JsonRecord;
  protocolVersion: ExternalAgentProtocolVersion;
  receiverAgentId: AgentId;
  replyTo?: string | null;
  requestId: string;
  runId: string;
  senderAgentId: AgentId;
  sentAt: string;
  sourceEndpoint?: string | null;
  status: A2ATaskLifecycleStatus;
  targetEndpoint?: string | null;
  taskType: string;
  threadId?: string | null;
  traceId: string;
};

type A2AEventArgs = {
  eventName: string;
  input?: unknown;
  output?: unknown;
  previousStatus?: A2ATaskLifecycleStatus | null;
  protocolContext: A2AProtocolContext;
  spanName: string;
  tags?: string[];
};

function normalizeJsonRecord(value: JsonRecord | undefined) {
  return value ?? {};
}

export function buildA2AProtocolTraceMetadata(context: A2AProtocolContext, extra?: JsonRecord) {
  return {
    completed_at: context.completedAt ?? null,
    message_id: context.messageId,
    operation: context.operation,
    parent_run_id: context.parentRunId ?? null,
    protocol_version: context.protocolVersion,
    receiver_agent_id: context.receiverAgentId,
    request_id: context.requestId,
    run_id: context.runId,
    sender_agent_id: context.senderAgentId,
    status: context.status,
    task_type: context.taskType,
    trace_id: context.traceId,
    ...(extra ?? {}),
  };
}

async function persistProtocolState(context: A2AProtocolContext) {
  await upsertAgentMessageRecord({
    authJson: context.authJson,
    completedAt: context.completedAt ?? null,
    contextJson: context.contextJson,
    conversationId: context.conversationId ?? null,
    deadlineAt: context.deadlineAt ?? null,
    idempotencyKey: context.idempotencyKey ?? null,
    messageId: context.messageId,
    operation: context.operation,
    parentRunId: context.parentRunId ?? null,
    payloadJson: context.payloadJson,
    protocolVersion: context.protocolVersion,
    receiverAgentId: context.receiverAgentId,
    replyTo: context.replyTo ?? null,
    requestId: context.requestId,
    senderAgentId: context.senderAgentId,
    sentAt: context.sentAt,
    status: context.status,
    taskType: context.taskType,
    threadId: context.threadId ?? null,
    traceId: context.traceId,
  });

  await upsertAgentRunRecord({
    completedAt: context.completedAt ?? null,
    messageId: context.messageId,
    parentRunId: context.parentRunId ?? null,
    receiverAgentId: context.receiverAgentId,
    requestId: context.requestId,
    runId: context.runId,
    senderAgentId: context.senderAgentId,
    startedAt: context.sentAt,
    status: context.status,
    traceId: context.traceId,
  });

  if (context.handoffId && context.handoffType && context.handoffStatus) {
    await upsertAgentHandoffRecord({
      childRunId: context.runId,
      completedAt: context.completedAt ?? null,
      handoffId: context.handoffId,
      handoffType: context.handoffType,
      messageId: context.messageId,
      metadataJson: context.handoffMetadata,
      parentRunId: context.parentRunId ?? null,
      receiverAgentId: context.receiverAgentId,
      requestId: context.requestId,
      senderAgentId: context.senderAgentId,
      sourceEndpoint: context.sourceEndpoint ?? null,
      status: context.handoffStatus,
      targetEndpoint: context.targetEndpoint ?? null,
      traceId: context.traceId,
    });
  }
}

export async function emitA2AProtocolEvent(args: A2AEventArgs) {
  await persistProtocolState(args.protocolContext);
  await createAgentTaskEventRecord({
    eventId: crypto.randomUUID(),
    eventName: args.eventName,
    messageId: args.protocolContext.messageId,
    parentRunId: args.protocolContext.parentRunId ?? null,
    payloadJson: normalizeJsonRecord(
      typeof args.output === "object" && args.output && !Array.isArray(args.output)
        ? (args.output as JsonRecord)
        : undefined,
    ),
    previousStatus: args.previousStatus ?? null,
    receiverAgentId: args.protocolContext.receiverAgentId,
    requestId: args.protocolContext.requestId,
    runId: args.protocolContext.runId,
    senderAgentId: args.protocolContext.senderAgentId,
    spanName: args.spanName,
    status: args.protocolContext.status,
    traceId: args.protocolContext.traceId,
  });

  return traceSpan(
    {
      input: args.input,
      metadata: buildA2AProtocolTraceMetadata(args.protocolContext),
      name: args.spanName,
      output: args.output,
      tags: ["a2a_protocol", ...(args.tags ?? [])],
      type: "task",
    },
    () => args.output ?? null,
  );
}
