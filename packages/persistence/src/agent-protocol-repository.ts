import type { AgentId, A2ATaskLifecycleStatus, ExternalAgentProtocolVersion } from "@/packages/contracts/src";
import { execute, getDatabasePool, isDatabaseConfigured, queryOptional, type DatabaseQueryable } from "./client";

type NullableString = string | null;

type AgentMessageRow = {
  auth_json: Record<string, unknown> | null;
  completed_at: Date | string | null;
  context_json: Record<string, unknown> | null;
  conversation_id: string | null;
  created_at: Date | string;
  deadline_at: Date | string | null;
  idempotency_key: string | null;
  message_id: string;
  operation: string;
  parent_run_id: string | null;
  payload_json: Record<string, unknown> | null;
  protocol_version: string;
  receiver_agent_id: string;
  reply_to: string | null;
  request_id: string;
  sender_agent_id: string;
  sent_at: Date | string;
  status: A2ATaskLifecycleStatus;
  task_type: string;
  thread_id: string | null;
  trace_id: string;
  updated_at: Date | string;
};

type AgentRunRow = {
  completed_at: Date | string | null;
  created_at: Date | string;
  error_json: Record<string, unknown> | null;
  message_id: string;
  parent_run_id: string | null;
  receiver_agent_id: string;
  request_id: string;
  run_id: string;
  sender_agent_id: string;
  started_at: Date | string;
  status: A2ATaskLifecycleStatus;
  trace_id: string;
  updated_at: Date | string;
};

type AgentHandoffRow = {
  child_run_id: string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
  handoff_id: string;
  handoff_type: string;
  message_id: string;
  metadata_json: Record<string, unknown> | null;
  parent_run_id: string | null;
  receiver_agent_id: string;
  request_id: string;
  sender_agent_id: string;
  source_endpoint: string | null;
  status: A2ATaskLifecycleStatus;
  target_endpoint: string | null;
  trace_id: string;
};

type AgentTaskEventRow = {
  created_at: Date | string;
  error_json: Record<string, unknown> | null;
  event_id: string;
  event_name: string;
  message_id: string;
  parent_run_id: string | null;
  payload_json: Record<string, unknown> | null;
  previous_status: A2ATaskLifecycleStatus | null;
  receiver_agent_id: string;
  request_id: string;
  run_id: string | null;
  sender_agent_id: string;
  span_name: string;
  status: A2ATaskLifecycleStatus;
  trace_id: string;
};

export type AgentMessageRecord = {
  authJson: Record<string, unknown>;
  completedAt: string | null;
  contextJson: Record<string, unknown>;
  conversationId: string | null;
  createdAt: string;
  deadlineAt: string | null;
  idempotencyKey: string | null;
  messageId: string;
  operation: string;
  parentRunId: string | null;
  payloadJson: Record<string, unknown>;
  protocolVersion: ExternalAgentProtocolVersion;
  receiverAgentId: AgentId;
  replyTo: string | null;
  requestId: string;
  senderAgentId: AgentId;
  sentAt: string;
  status: A2ATaskLifecycleStatus;
  taskType: string;
  threadId: string | null;
  traceId: string;
  updatedAt: string;
};

export type AgentRunRecord = {
  completedAt: string | null;
  createdAt: string;
  errorJson: Record<string, unknown>;
  messageId: string;
  parentRunId: string | null;
  receiverAgentId: AgentId;
  requestId: string;
  runId: string;
  senderAgentId: AgentId;
  startedAt: string;
  status: A2ATaskLifecycleStatus;
  traceId: string;
  updatedAt: string;
};

export type AgentHandoffRecord = {
  childRunId: string | null;
  completedAt: string | null;
  createdAt: string;
  handoffId: string;
  handoffType: string;
  messageId: string;
  metadataJson: Record<string, unknown>;
  parentRunId: string | null;
  receiverAgentId: AgentId;
  requestId: string;
  senderAgentId: AgentId;
  sourceEndpoint: string | null;
  status: A2ATaskLifecycleStatus;
  targetEndpoint: string | null;
  traceId: string;
};

export type AgentTaskEventRecord = {
  createdAt: string;
  errorJson: Record<string, unknown>;
  eventId: string;
  eventName: string;
  messageId: string;
  parentRunId: string | null;
  payloadJson: Record<string, unknown>;
  previousStatus: A2ATaskLifecycleStatus | null;
  receiverAgentId: AgentId;
  requestId: string;
  runId: string | null;
  senderAgentId: AgentId;
  spanName: string;
  status: A2ATaskLifecycleStatus;
  traceId: string;
};

type AgentMessageUpsertArgs = {
  authJson?: Record<string, unknown>;
  completedAt?: string | null;
  contextJson?: Record<string, unknown>;
  conversationId?: string | null;
  deadlineAt?: string | null;
  idempotencyKey?: string | null;
  messageId: string;
  operation: string;
  parentRunId?: string | null;
  payloadJson?: Record<string, unknown>;
  protocolVersion: ExternalAgentProtocolVersion;
  receiverAgentId: AgentId;
  replyTo?: string | null;
  requestId: string;
  senderAgentId: AgentId;
  sentAt: string;
  status: A2ATaskLifecycleStatus;
  taskType: string;
  threadId?: string | null;
  traceId: string;
};

type AgentRunUpsertArgs = {
  completedAt?: string | null;
  errorJson?: Record<string, unknown>;
  messageId: string;
  parentRunId?: string | null;
  receiverAgentId: AgentId;
  requestId: string;
  runId: string;
  senderAgentId: AgentId;
  startedAt: string;
  status: A2ATaskLifecycleStatus;
  traceId: string;
};

type AgentHandoffUpsertArgs = {
  childRunId?: string | null;
  completedAt?: string | null;
  handoffId: string;
  handoffType: string;
  messageId: string;
  metadataJson?: Record<string, unknown>;
  parentRunId?: string | null;
  receiverAgentId: AgentId;
  requestId: string;
  senderAgentId: AgentId;
  sourceEndpoint?: string | null;
  status: A2ATaskLifecycleStatus;
  targetEndpoint?: string | null;
  traceId: string;
};

type AgentTaskEventCreateArgs = {
  errorJson?: Record<string, unknown>;
  eventId: string;
  eventName: string;
  messageId: string;
  parentRunId?: string | null;
  payloadJson?: Record<string, unknown>;
  previousStatus?: A2ATaskLifecycleStatus | null;
  receiverAgentId: AgentId;
  requestId: string;
  runId?: string | null;
  senderAgentId: AgentId;
  spanName: string;
  status: A2ATaskLifecycleStatus;
  traceId: string;
};

const validStatusTransitions: Record<A2ATaskLifecycleStatus, A2ATaskLifecycleStatus[]> = {
  accepted: ["running", "awaiting_input", "completed", "failed", "cancelled", "partial"],
  awaiting_input: ["running", "completed", "failed", "cancelled", "partial"],
  cancelled: [],
  completed: [],
  failed: [],
  partial: ["running", "completed", "failed", "cancelled"],
  running: ["awaiting_input", "completed", "failed", "partial", "cancelled"],
};

function toIsoString(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function toJsonRecord(value: Record<string, unknown> | null | undefined) {
  return value ?? {};
}

function mapAgentMessageRow(row: AgentMessageRow): AgentMessageRecord {
  return {
    authJson: toJsonRecord(row.auth_json),
    completedAt: toIsoString(row.completed_at),
    contextJson: toJsonRecord(row.context_json),
    conversationId: row.conversation_id,
    createdAt: new Date(row.created_at).toISOString(),
    deadlineAt: toIsoString(row.deadline_at),
    idempotencyKey: row.idempotency_key,
    messageId: row.message_id,
    operation: row.operation,
    parentRunId: row.parent_run_id,
    payloadJson: toJsonRecord(row.payload_json),
    protocolVersion: row.protocol_version as ExternalAgentProtocolVersion,
    receiverAgentId: row.receiver_agent_id as AgentId,
    replyTo: row.reply_to,
    requestId: row.request_id,
    senderAgentId: row.sender_agent_id as AgentId,
    sentAt: new Date(row.sent_at).toISOString(),
    status: row.status,
    taskType: row.task_type,
    threadId: row.thread_id,
    traceId: row.trace_id,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapAgentRunRow(row: AgentRunRow): AgentRunRecord {
  return {
    completedAt: toIsoString(row.completed_at),
    createdAt: new Date(row.created_at).toISOString(),
    errorJson: toJsonRecord(row.error_json),
    messageId: row.message_id,
    parentRunId: row.parent_run_id,
    receiverAgentId: row.receiver_agent_id as AgentId,
    requestId: row.request_id,
    runId: row.run_id,
    senderAgentId: row.sender_agent_id as AgentId,
    startedAt: new Date(row.started_at).toISOString(),
    status: row.status,
    traceId: row.trace_id,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapAgentHandoffRow(row: AgentHandoffRow): AgentHandoffRecord {
  return {
    childRunId: row.child_run_id,
    completedAt: toIsoString(row.completed_at),
    createdAt: new Date(row.created_at).toISOString(),
    handoffId: row.handoff_id,
    handoffType: row.handoff_type,
    messageId: row.message_id,
    metadataJson: toJsonRecord(row.metadata_json),
    parentRunId: row.parent_run_id,
    receiverAgentId: row.receiver_agent_id as AgentId,
    requestId: row.request_id,
    senderAgentId: row.sender_agent_id as AgentId,
    sourceEndpoint: row.source_endpoint,
    status: row.status,
    targetEndpoint: row.target_endpoint,
    traceId: row.trace_id,
  };
}

function mapAgentTaskEventRow(row: AgentTaskEventRow): AgentTaskEventRecord {
  return {
    createdAt: new Date(row.created_at).toISOString(),
    errorJson: toJsonRecord(row.error_json),
    eventId: row.event_id,
    eventName: row.event_name,
    messageId: row.message_id,
    parentRunId: row.parent_run_id,
    payloadJson: toJsonRecord(row.payload_json),
    previousStatus: row.previous_status,
    receiverAgentId: row.receiver_agent_id as AgentId,
    requestId: row.request_id,
    runId: row.run_id,
    senderAgentId: row.sender_agent_id as AgentId,
    spanName: row.span_name,
    status: row.status,
    traceId: row.trace_id,
  };
}

function normalizeStatusTransition(previousStatus: A2ATaskLifecycleStatus | null, nextStatus: A2ATaskLifecycleStatus) {
  if (!previousStatus || previousStatus === nextStatus) {
    return;
  }

  if (!validStatusTransitions[previousStatus].includes(nextStatus)) {
    throw new Error(`Invalid agent task status transition: ${previousStatus} -> ${nextStatus}`);
  }
}

async function withProtocolQuery<T>(callback: (queryable: DatabaseQueryable) => Promise<T>) {
  if (!isDatabaseConfigured()) {
    return null;
  }

  return callback(getDatabasePool());
}

export function assertValidAgentTaskStatusTransition(
  previousStatus: A2ATaskLifecycleStatus | null,
  nextStatus: A2ATaskLifecycleStatus,
) {
  normalizeStatusTransition(previousStatus, nextStatus);
}

export async function upsertAgentMessageRecord(args: AgentMessageUpsertArgs) {
  return withProtocolQuery(async (queryable) => {
    const existing = await queryOptional<{ status: A2ATaskLifecycleStatus }>(
      queryable,
      "SELECT status FROM agent_messages WHERE message_id = $1",
      [args.messageId],
    );
    normalizeStatusTransition(existing?.status ?? null, args.status);

    const result = await execute<AgentMessageRow>(
      queryable,
      `
        INSERT INTO agent_messages (
          message_id,
          request_id,
          protocol_version,
          sender_agent_id,
          receiver_agent_id,
          conversation_id,
          thread_id,
          reply_to,
          parent_run_id,
          trace_id,
          task_type,
          operation,
          payload_json,
          context_json,
          auth_json,
          idempotency_key,
          sent_at,
          deadline_at,
          status,
          completed_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17::timestamptz,
          $18::timestamptz, $19, $20::timestamptz
        )
        ON CONFLICT (message_id) DO UPDATE SET
          protocol_version = EXCLUDED.protocol_version,
          sender_agent_id = EXCLUDED.sender_agent_id,
          receiver_agent_id = EXCLUDED.receiver_agent_id,
          conversation_id = EXCLUDED.conversation_id,
          thread_id = EXCLUDED.thread_id,
          reply_to = EXCLUDED.reply_to,
          parent_run_id = EXCLUDED.parent_run_id,
          trace_id = EXCLUDED.trace_id,
          task_type = EXCLUDED.task_type,
          operation = EXCLUDED.operation,
          payload_json = EXCLUDED.payload_json,
          context_json = EXCLUDED.context_json,
          auth_json = EXCLUDED.auth_json,
          idempotency_key = EXCLUDED.idempotency_key,
          sent_at = EXCLUDED.sent_at,
          deadline_at = EXCLUDED.deadline_at,
          status = EXCLUDED.status,
          completed_at = EXCLUDED.completed_at,
          updated_at = NOW()
        RETURNING *
      `,
      [
        args.messageId,
        args.requestId,
        args.protocolVersion,
        args.senderAgentId,
        args.receiverAgentId,
        args.conversationId ?? null,
        args.threadId ?? null,
        args.replyTo ?? null,
        args.parentRunId ?? null,
        args.traceId,
        args.taskType,
        args.operation,
        JSON.stringify(args.payloadJson ?? {}),
        JSON.stringify(args.contextJson ?? {}),
        JSON.stringify(args.authJson ?? {}),
        args.idempotencyKey ?? null,
        args.sentAt,
        args.deadlineAt ?? null,
        args.status,
        args.completedAt ?? null,
      ],
    );

    return mapAgentMessageRow(result.rows[0]!);
  });
}

export async function upsertAgentRunRecord(args: AgentRunUpsertArgs) {
  return withProtocolQuery(async (queryable) => {
    const existing = await queryOptional<{ status: A2ATaskLifecycleStatus }>(
      queryable,
      "SELECT status FROM agent_runs WHERE run_id = $1",
      [args.runId],
    );
    normalizeStatusTransition(existing?.status ?? null, args.status);

    const result = await execute<AgentRunRow>(
      queryable,
      `
        INSERT INTO agent_runs (
          run_id,
          message_id,
          request_id,
          parent_run_id,
          trace_id,
          sender_agent_id,
          receiver_agent_id,
          status,
          started_at,
          completed_at,
          error_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::jsonb)
        ON CONFLICT (run_id) DO UPDATE SET
          message_id = EXCLUDED.message_id,
          request_id = EXCLUDED.request_id,
          parent_run_id = EXCLUDED.parent_run_id,
          trace_id = EXCLUDED.trace_id,
          sender_agent_id = EXCLUDED.sender_agent_id,
          receiver_agent_id = EXCLUDED.receiver_agent_id,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          error_json = EXCLUDED.error_json,
          updated_at = NOW()
        RETURNING *
      `,
      [
        args.runId,
        args.messageId,
        args.requestId,
        args.parentRunId ?? null,
        args.traceId,
        args.senderAgentId,
        args.receiverAgentId,
        args.status,
        args.startedAt,
        args.completedAt ?? null,
        JSON.stringify(args.errorJson ?? {}),
      ],
    );

    return mapAgentRunRow(result.rows[0]!);
  });
}

export async function upsertAgentHandoffRecord(args: AgentHandoffUpsertArgs) {
  return withProtocolQuery(async (queryable) => {
    const existing = await queryOptional<{ status: A2ATaskLifecycleStatus }>(
      queryable,
      "SELECT status FROM agent_handoffs WHERE handoff_id = $1",
      [args.handoffId],
    );
    normalizeStatusTransition(existing?.status ?? null, args.status);

    const result = await execute<AgentHandoffRow>(
      queryable,
      `
        INSERT INTO agent_handoffs (
          handoff_id,
          message_id,
          request_id,
          parent_run_id,
          child_run_id,
          sender_agent_id,
          receiver_agent_id,
          source_endpoint,
          target_endpoint,
          handoff_type,
          status,
          trace_id,
          metadata_json,
          completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::timestamptz)
        ON CONFLICT (handoff_id) DO UPDATE SET
          child_run_id = EXCLUDED.child_run_id,
          status = EXCLUDED.status,
          trace_id = EXCLUDED.trace_id,
          metadata_json = EXCLUDED.metadata_json,
          completed_at = EXCLUDED.completed_at
        RETURNING *
      `,
      [
        args.handoffId,
        args.messageId,
        args.requestId,
        args.parentRunId ?? null,
        args.childRunId ?? null,
        args.senderAgentId,
        args.receiverAgentId,
        args.sourceEndpoint ?? null,
        args.targetEndpoint ?? null,
        args.handoffType,
        args.status,
        args.traceId,
        JSON.stringify(args.metadataJson ?? {}),
        args.completedAt ?? null,
      ],
    );

    return mapAgentHandoffRow(result.rows[0]!);
  });
}

export async function createAgentTaskEventRecord(args: AgentTaskEventCreateArgs) {
  return withProtocolQuery(async (queryable) => {
    const result = await execute<AgentTaskEventRow>(
      queryable,
      `
        INSERT INTO agent_task_events (
          event_id,
          message_id,
          request_id,
          run_id,
          parent_run_id,
          sender_agent_id,
          receiver_agent_id,
          event_name,
          span_name,
          status,
          previous_status,
          trace_id,
          payload_json,
          error_json
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb
        )
        RETURNING *
      `,
      [
        args.eventId,
        args.messageId,
        args.requestId,
        args.runId ?? null,
        args.parentRunId ?? null,
        args.senderAgentId,
        args.receiverAgentId,
        args.eventName,
        args.spanName,
        args.status,
        args.previousStatus ?? null,
        args.traceId,
        JSON.stringify(args.payloadJson ?? {}),
        JSON.stringify(args.errorJson ?? {}),
      ],
    );

    return mapAgentTaskEventRow(result.rows[0]!);
  });
}

export async function getAgentMessageRecordById(messageId: string) {
  return withProtocolQuery(async (queryable) => {
    const row = await queryOptional<AgentMessageRow>(
      queryable,
      "SELECT * FROM agent_messages WHERE message_id = $1",
      [messageId],
    );

    return row ? mapAgentMessageRow(row) : null;
  });
}

export async function getAgentRunRecordById(runId: string) {
  return withProtocolQuery(async (queryable) => {
    const row = await queryOptional<AgentRunRow>(
      queryable,
      "SELECT * FROM agent_runs WHERE run_id = $1",
      [runId],
    );

    return row ? mapAgentRunRow(row) : null;
  });
}

export async function listAgentHandoffsByParentRunId(parentRunId: string) {
  const result = await withProtocolQuery(async (queryable) => {
    const rows = await execute<AgentHandoffRow>(
      queryable,
      "SELECT * FROM agent_handoffs WHERE parent_run_id = $1 ORDER BY created_at ASC",
      [parentRunId],
    );

    return rows.rows.map(mapAgentHandoffRow);
  });

  return result ?? [];
}

export async function listAgentTaskEventsByRequestId(requestId: string) {
  const result = await withProtocolQuery(async (queryable) => {
    const rows = await execute<AgentTaskEventRow>(
      queryable,
      "SELECT * FROM agent_task_events WHERE request_id = $1 ORDER BY created_at ASC",
      [requestId],
    );

    return rows.rows.map(mapAgentTaskEventRow);
  });

  return result ?? [];
}
