import { z } from "zod";
import {
  ApiError,
  chatAuditActivityEventSchema,
  chatCheckpointSchema,
  chatMemoryRecordSchema,
  chatProjectActivitySnapshotSchema,
  chatWorkspaceSnapshotSchema,
  type ChatAttachment,
  type ChatAuditActivityEvent,
  type ChatCheckpoint,
  type ChatConversation,
  type ChatMemoryRecord,
  type ChatMessage,
  type ChatProject,
  type ChatProjectActivitySnapshot,
  type ChatWorkspaceSnapshot,
} from "@/packages/contracts/src";
import {
  getDatabasePool,
  queryOptional,
  withDatabaseTransaction,
  type DatabaseQueryable,
} from "./client";

const seededProjectLabels = ["Verified profile", "Career story", "Hiring signals"] as const;
const autoCheckpointMessageInterval = 4;
const maxActivityEvents = 24;
const maxActivityCheckpoints = 12;
const maxActivityMemories = 12;

type ProjectRow = {
  archived_at: Date | string | null;
  created_at: Date | string;
  id: string;
  last_checkpoint_at: Date | string | null;
  last_message_at: Date | string | null;
  last_saved_at: Date | string | null;
  latest_summary: string;
  metadata_json: Record<string, unknown> | null;
  organization_id: string | null;
  owner_id: string;
  status: "active" | "archived";
  title: string;
  updated_at: Date | string;
};

type ConversationRow = {
  archived_at: Date | string | null;
  created_at: Date | string;
  id: string;
  label_source: "auto" | "manual";
  last_message_at: Date | string | null;
  owner_id: string;
  project_id: string;
  status: "active" | "archived";
  title: string;
  updated_at: Date | string;
};

type MessageRow = {
  client_request_id: string | null;
  content: string;
  conversation_id: string;
  created_at: Date | string;
  error: boolean;
  id: string;
  metadata_json: Record<string, unknown> | null;
  owner_id: string;
  reply_to_message_id: string | null;
  role: "assistant" | "user";
  sequence_number: number;
  structured_payload: Record<string, unknown> | null;
  tool_calls: unknown[] | null;
};

type AttachmentRow = {
  conversation_id: string | null;
  created_at: Date | string;
  extension: string;
  id: string;
  message_id: string | null;
  metadata_json: Record<string, unknown> | null;
  mime_type: string;
  original_name: string;
  owner_id: string;
  preview_kind: ChatAttachment["previewKind"];
  project_id: string | null;
  scan_status: "not_scanned" | "pending";
  size_bytes: number | string;
  status: ChatAttachment["status"];
  storage_key: string;
  updated_at: Date | string;
};

type MemoryRow = {
  confidence: number | string;
  content: string;
  conversation_id: string | null;
  created_at: Date | string;
  id: string;
  memory_type: ChatMemoryRecord["memoryType"];
  metadata_json: Record<string, unknown> | null;
  owner_id: string;
  project_id: string | null;
  scope: ChatMemoryRecord["scope"];
  scope_id: string;
  source_message_ids: string[] | null;
  title: string;
  updated_at: Date | string;
  verification_status: ChatMemoryRecord["verificationStatus"];
};

type CheckpointRow = {
  checkpoint_type: ChatCheckpoint["checkpointType"];
  conversation_id: string | null;
  created_at: Date | string;
  created_by: string;
  id: string;
  owner_id: string;
  project_id: string;
  restored_at: Date | string | null;
  serialized_state_json: unknown;
  summary: string;
  title: string;
};

type AuditEventRow = {
  actor_id: string;
  created_at: Date | string;
  entity_id: string;
  entity_type: string;
  event_type: string;
  id: string;
  payload_json: Record<string, unknown> | null;
  summary: string;
};

type MemoryJobRow = {
  attempts: number;
  conversation_id: string | null;
  created_at: Date | string;
  error_message: string | null;
  id: string;
  last_attempt_at: Date | string | null;
  owner_id: string;
  payload_json: Record<string, unknown> | null;
  project_id: string;
  status: "pending" | "completed" | "failed" | "dead_letter";
  trigger_message_id: string | null;
  updated_at: Date | string;
};

const checkpointProjectRowSchema = z.object({
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  lastCheckpointAt: z.string().datetime().nullable(),
  lastMessageAt: z.string().datetime().nullable(),
  lastSavedAt: z.string().datetime().nullable(),
  latestSummary: z.string(),
  metadataJson: z.record(z.string(), z.unknown()),
  organizationId: z.string().nullable(),
  ownerId: z.string().min(1),
  status: z.enum(["active", "archived"]),
  title: z.string().min(1),
  updatedAt: z.string().datetime(),
});

const checkpointConversationRowSchema = z.object({
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  labelSource: z.enum(["auto", "manual"]),
  lastMessageAt: z.string().datetime().nullable(),
  ownerId: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(["active", "archived"]),
  title: z.string().min(1),
  updatedAt: z.string().datetime(),
});

const checkpointMessageRowSchema = z.object({
  clientRequestId: z.string().nullable(),
  content: z.string(),
  conversationId: z.string().min(1),
  createdAt: z.string().datetime(),
  error: z.boolean(),
  id: z.string().min(1),
  metadataJson: z.record(z.string(), z.unknown()),
  ownerId: z.string().min(1),
  replyToMessageId: z.string().nullable(),
  role: z.enum(["assistant", "user"]),
  sequenceNumber: z.number().int().nonnegative(),
  structuredPayload: z.record(z.string(), z.unknown()),
  toolCalls: z.array(z.unknown()),
});

const checkpointAttachmentRowSchema = z.object({
  conversationId: z.string().nullable(),
  createdAt: z.string().datetime(),
  extension: z.string().min(1),
  id: z.string().min(1),
  messageId: z.string().nullable(),
  metadataJson: z.record(z.string(), z.unknown()),
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
  ownerId: z.string().min(1),
  previewKind: z.enum(["document", "image", "pdf", "presentation", "spreadsheet", "text"]),
  projectId: z.string().nullable(),
  scanStatus: z.enum(["not_scanned", "pending"]),
  sizeBytes: z.number().int().nonnegative(),
  status: z.enum(["attached", "uploaded"]),
  storageKey: z.string().min(1),
  updatedAt: z.string().datetime(),
});

const checkpointMemoryRowSchema = z.object({
  confidence: z.number().min(0).max(1),
  content: z.string().min(1),
  conversationId: z.string().nullable(),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  memoryType: z.enum(["preference", "fact", "goal", "constraint", "summary", "task"]),
  metadataJson: z.record(z.string(), z.unknown()),
  ownerId: z.string().min(1),
  projectId: z.string().nullable(),
  scope: z.enum(["user", "project", "thread"]),
  scopeId: z.string().min(1),
  sourceMessageIds: z.array(z.string().min(1)),
  title: z.string().min(1),
  updatedAt: z.string().datetime(),
  verificationStatus: z.enum(["unverified", "verified"]),
});

const checkpointStateSchema = z.object({
  attachments: z.array(checkpointAttachmentRowSchema),
  completedTasks: z.array(z.string()),
  conversations: z.array(checkpointConversationRowSchema),
  generatedArtifactReferences: z.array(
    z.object({
      attachmentId: z.string().min(1),
      messageId: z.string().nullable(),
      originalName: z.string().min(1),
    }),
  ),
  memoryRecords: z.array(checkpointMemoryRowSchema),
  messages: z.array(checkpointMessageRowSchema),
  pendingTasks: z.array(z.string()),
  project: checkpointProjectRowSchema,
  workflowState: z.record(z.string(), z.unknown()),
});

function createEntityId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function formatIso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeLabel(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

function truncateLabel(label: string, maxLength: number) {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildAttachmentSummary(attachments: AttachmentRow[]) {
  if (attachments.length === 0) {
    return "";
  }

  if (attachments.length === 1) {
    return `Attachment: ${attachments[0].original_name}`;
  }

  return `Attachments: ${attachments[0].original_name} +${attachments.length - 1} more`;
}

function buildConversationTitle(args: {
  attachments: AttachmentRow[];
  message: string;
}) {
  const normalizedMessage = normalizeLabel(args.message);

  if (normalizedMessage) {
    return truncateLabel(normalizedMessage, 80);
  }

  return truncateLabel(buildAttachmentSummary(args.attachments) || "New chat", 80);
}

function buildProjectTitle(projects: ProjectRow[]) {
  let projectIndex = 1;

  while (true) {
    const nextTitle = projectIndex === 1 ? "New project" : `New project ${projectIndex}`;

    if (!projects.some((project) => project.title === nextTitle)) {
      return nextTitle;
    }

    projectIndex += 1;
  }
}

function buildApiError(args: {
  correlationId: string;
  details: Record<string, unknown>;
  errorCode: ApiError["errorCode"];
  message: string;
  status: number;
}) {
  return new ApiError(args);
}

function mapProjectRow(row: ProjectRow): ChatProject {
  return {
    createdAt: formatIso(row.created_at)!,
    id: row.id,
    label: row.title,
    updatedAt: formatIso(row.updated_at)!,
  };
}

function mapAttachmentRow(row: AttachmentRow): ChatAttachment {
  const openUrl = `/api/chat/attachments/${row.id}`;

  return {
    createdAt: formatIso(row.created_at)!,
    downloadUrl: `${openUrl}?download=1`,
    extension: row.extension,
    id: row.id,
    messageId: row.message_id,
    mimeType: row.mime_type,
    openUrl,
    originalName: row.original_name,
    previewKind: row.preview_kind,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    thumbnailUrl: row.preview_kind === "image" ? openUrl : null,
    updatedAt: formatIso(row.updated_at)!,
  };
}

function mapMessageRow(row: MessageRow, attachments: AttachmentRow[]): ChatMessage {
  return {
    attachments: attachments.map(mapAttachmentRow),
    content: row.content,
    createdAt: formatIso(row.created_at)!,
    error: row.error,
    id: row.id,
    role: row.role,
  };
}

function mapConversationRow(args: {
  attachments: AttachmentRow[];
  messages: MessageRow[];
  row: ConversationRow;
}): ChatConversation {
  return {
    createdAt: formatIso(args.row.created_at)!,
    id: args.row.id,
    label: args.row.title,
    labelSource: args.row.label_source,
    messages: args.messages.map((message) =>
      mapMessageRow(
        message,
        args.attachments.filter((attachment) => attachment.message_id === message.id),
      ),
    ),
    projectId: args.row.project_id,
    updatedAt: formatIso(args.row.updated_at)!,
  };
}

function mapMemoryRow(row: MemoryRow): ChatMemoryRecord {
  return chatMemoryRecordSchema.parse({
    confidence: Number(row.confidence),
    content: row.content,
    createdAt: formatIso(row.created_at)!,
    id: row.id,
    memoryType: row.memory_type,
    scope: row.scope,
    scopeId: row.scope_id,
    sourceMessageIds: row.source_message_ids ?? [],
    title: row.title,
    updatedAt: formatIso(row.updated_at)!,
    verificationStatus: row.verification_status,
  });
}

function mapCheckpointRow(row: CheckpointRow): ChatCheckpoint {
  return chatCheckpointSchema.parse({
    checkpointType: row.checkpoint_type,
    conversationId: row.conversation_id,
    createdAt: formatIso(row.created_at)!,
    createdBy: row.created_by,
    id: row.id,
    projectId: row.project_id,
    restoredAt: formatIso(row.restored_at),
    summary: row.summary,
    title: row.title,
  });
}

function mapAuditEventRow(row: AuditEventRow): ChatAuditActivityEvent {
  return chatAuditActivityEventSchema.parse({
    actorId: row.actor_id,
    createdAt: formatIso(row.created_at)!,
    entityId: row.entity_id,
    entityType: row.entity_type,
    eventType: row.event_type,
    id: row.id,
    payloadJson: row.payload_json ?? {},
    summary: row.summary,
  });
}

async function insertAuditEvent(
  queryable: DatabaseQueryable,
  args: {
    actorId: string;
    entityId: string;
    entityType: string;
    eventType: string;
    ownerId: string;
    payloadJson?: Record<string, unknown>;
    summary: string;
  },
) {
  await queryable.query(
    `
      INSERT INTO chat_audit_events (
        id,
        owner_id,
        entity_type,
        entity_id,
        event_type,
        actor_id,
        summary,
        payload_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      createEntityId("audit"),
      args.ownerId,
      args.entityType,
      args.entityId,
      args.eventType,
      args.actorId,
      args.summary,
      JSON.stringify(args.payloadJson ?? {}),
    ],
  );
}

async function ensureOwnerWorkspace(queryable: DatabaseQueryable, ownerId: string) {
  const existingProjects = await queryable.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM chat_projects
      WHERE owner_id = $1
        AND archived_at IS NULL
    `,
    [ownerId],
  );

  if (Number(existingProjects.rows[0]?.count ?? 0) > 0) {
    return;
  }

  const seedStart = Date.now();

  for (const [index, title] of seededProjectLabels.entries()) {
    const timestamp = new Date(seedStart + index).toISOString();
    const projectId = createEntityId("project");

    await queryable.query(
      `
        INSERT INTO chat_projects (
          id,
          owner_id,
          title,
          status,
          last_saved_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'active', $4::timestamptz, $4::timestamptz, $4::timestamptz)
      `,
      [projectId, ownerId, title, timestamp],
    );

    await insertAuditEvent(queryable, {
      actorId: "system:workspace-seed",
      entityId: projectId,
      entityType: "project",
      eventType: "project.created",
      ownerId,
      payloadJson: { seeded: true, title },
      summary: `Seeded project "${title}".`,
    });
  }
}

async function requireProjectRow(
  queryable: DatabaseQueryable,
  ownerId: string,
  projectId: string,
) {
  const row = await queryOptional<ProjectRow>(
    queryable,
    `
      SELECT *
      FROM chat_projects
      WHERE owner_id = $1
        AND id = $2
        AND archived_at IS NULL
    `,
    [ownerId, projectId],
  );

  if (!row) {
    throw buildApiError({
      correlationId: `chat_project_${projectId}`,
      details: { projectId },
      errorCode: "NOT_FOUND",
      message: "Project was not found.",
      status: 404,
    });
  }

  return row;
}

async function requireConversationRow(
  queryable: DatabaseQueryable,
  ownerId: string,
  conversationId: string,
) {
  const row = await queryOptional<ConversationRow>(
    queryable,
    `
      SELECT *
      FROM chat_conversations
      WHERE owner_id = $1
        AND id = $2
        AND archived_at IS NULL
    `,
    [ownerId, conversationId],
  );

  if (!row) {
    throw buildApiError({
      correlationId: `chat_conversation_${conversationId}`,
      details: { conversationId },
      errorCode: "NOT_FOUND",
      message: "Conversation was not found.",
      status: 404,
    });
  }

  return row;
}

async function requireAttachmentRow(
  queryable: DatabaseQueryable,
  ownerId: string,
  attachmentId: string,
) {
  const row = await queryOptional<AttachmentRow>(
    queryable,
    `
      SELECT *
      FROM chat_attachments
      WHERE owner_id = $1
        AND id = $2
    `,
    [ownerId, attachmentId],
  );

  if (!row) {
    throw buildApiError({
      correlationId: `chat_attachment_${attachmentId}`,
      details: { attachmentId },
      errorCode: "NOT_FOUND",
      message: "Attachment was not found.",
      status: 404,
    });
  }

  return row;
}

async function getProjectPersistenceMaps(queryable: DatabaseQueryable, ownerId: string) {
  const checkpointCounts = await queryable.query<{
    checkpoint_count: string;
    project_id: string;
  }>(
    `
      SELECT project_id, COUNT(*)::text AS checkpoint_count
      FROM chat_checkpoints
      WHERE owner_id = $1
      GROUP BY project_id
    `,
    [ownerId],
  );
  const pendingJobs = await queryable.query<{
    pending_jobs: string;
    project_id: string;
  }>(
    `
      SELECT project_id, COUNT(*)::text AS pending_jobs
      FROM chat_memory_jobs
      WHERE owner_id = $1
        AND status = 'pending'
      GROUP BY project_id
    `,
    [ownerId],
  );

  return {
    checkpointCountByProject: new Map(
      checkpointCounts.rows.map((row) => [row.project_id, Number(row.checkpoint_count)]),
    ),
    pendingJobsByProject: new Map(
      pendingJobs.rows.map((row) => [row.project_id, Number(row.pending_jobs)]),
    ),
  };
}

async function buildWorkspaceSnapshotFromQueryable(
  queryable: DatabaseQueryable,
  ownerId: string,
) {
  await ensureOwnerWorkspace(queryable, ownerId);

  const [projectsResult, conversationsResult, messagesResult, attachmentsResult] = await Promise.all([
    queryable.query<ProjectRow>(
      `
        SELECT *
        FROM chat_projects
        WHERE owner_id = $1
          AND archived_at IS NULL
        ORDER BY created_at ASC
      `,
      [ownerId],
    ),
    queryable.query<ConversationRow>(
      `
        SELECT *
        FROM chat_conversations
        WHERE owner_id = $1
          AND archived_at IS NULL
        ORDER BY updated_at DESC
      `,
      [ownerId],
    ),
    queryable.query<MessageRow>(
      `
        SELECT *
        FROM chat_messages
        WHERE owner_id = $1
        ORDER BY created_at ASC
      `,
      [ownerId],
    ),
    queryable.query<AttachmentRow>(
      `
        SELECT *
        FROM chat_attachments
        WHERE owner_id = $1
        ORDER BY created_at ASC
      `,
      [ownerId],
    ),
  ]);

  const { checkpointCountByProject, pendingJobsByProject } = await getProjectPersistenceMaps(
    queryable,
    ownerId,
  );
  const projects = projectsResult.rows;
  const conversations = conversationsResult.rows;
  const messages = messagesResult.rows;
  const attachments = attachmentsResult.rows;
  const workspaceLastSavedAt = projects
    .map((project) => formatIso(project.last_saved_at))
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const workspaceLastCheckpointAt = projects
    .map((project) => formatIso(project.last_checkpoint_at))
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const projectPersistence = Object.fromEntries(
    projects.map((project) => {
      const lastActivityAt = [
        formatIso(project.last_message_at),
        formatIso(project.updated_at),
        formatIso(project.last_saved_at),
        formatIso(project.last_checkpoint_at),
      ]
        .filter((timestamp): timestamp is string => Boolean(timestamp))
        .sort((left, right) => right.localeCompare(left))[0] ?? null;

      return [
        project.id,
        {
          checkpointCount: checkpointCountByProject.get(project.id) ?? 0,
          lastActivityAt,
          lastCheckpointAt: formatIso(project.last_checkpoint_at),
          lastSavedAt: formatIso(project.last_saved_at),
          pendingMemoryJobs: pendingJobsByProject.get(project.id) ?? 0,
          projectId: project.id,
        },
      ];
    }),
  );

  return chatWorkspaceSnapshotSchema.parse({
    conversations: conversations.map((conversation) =>
      mapConversationRow({
        attachments: attachments.filter(
          (attachment) => attachment.conversation_id === conversation.id && attachment.message_id !== null,
        ),
        messages: messages.filter((message) => message.conversation_id === conversation.id),
        row: conversation,
      }),
    ),
    persistence: {
      checkpointCount: [...checkpointCountByProject.values()].reduce(
        (total, count) => total + count,
        0,
      ),
      lastCheckpointAt: workspaceLastCheckpointAt,
      lastSavedAt: workspaceLastSavedAt,
      pendingMemoryJobs: [...pendingJobsByProject.values()].reduce(
        (total, count) => total + count,
        0,
      ),
    },
    projectPersistence,
    projects: projects.map(mapProjectRow),
  });
}

function requireConversationFromSnapshot(
  snapshot: ChatWorkspaceSnapshot,
  conversationId: string,
) {
  const conversation = snapshot.conversations.find((candidate) => candidate.id === conversationId);

  if (!conversation) {
    throw buildApiError({
      correlationId: `chat_conversation_${conversationId}`,
      details: { conversationId },
      errorCode: "NOT_FOUND",
      message: "Conversation was not found.",
      status: 404,
    });
  }

  return conversation;
}

function requireMessageFromConversation(conversation: ChatConversation, messageId: string) {
  const message = conversation.messages.find((candidate) => candidate.id === messageId);

  if (!message) {
    throw new Error(`Expected message ${messageId} in conversation ${conversation.id}.`);
  }

  return message;
}

async function getNextSequenceNumber(
  queryable: DatabaseQueryable,
  conversationId: string,
) {
  const row = await queryOptional<{ next_sequence: string }>(
    queryable,
    `
      SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence
      FROM chat_messages
      WHERE conversation_id = $1
    `,
    [conversationId],
  );

  return Number(row?.next_sequence ?? 1);
}

async function requirePendingAttachments(
  queryable: DatabaseQueryable,
  ownerId: string,
  attachmentIds: string[],
) {
  const attachments: AttachmentRow[] = [];

  for (const attachmentId of attachmentIds) {
    const attachment = await requireAttachmentRow(queryable, ownerId, attachmentId);

    if (attachment.message_id) {
      throw buildApiError({
        correlationId: `chat_attachment_${attachmentId}`,
        details: { attachmentId },
        errorCode: "CONFLICT",
        message: "Attachment has already been sent.",
        status: 409,
      });
    }

    attachments.push(attachment);
  }

  const distinctIds = new Set(attachments.map((attachment) => attachment.id));

  if (distinctIds.size !== attachments.length) {
    throw buildApiError({
      correlationId: `chat_attachment_duplicate_${ownerId}`,
      details: { attachmentIds },
      errorCode: "VALIDATION_FAILED",
      message: "Remove duplicate attachments before sending.",
      status: 400,
    });
  }

  return attachments;
}

function buildMemoryCandidates(args: {
  assistantMessage: string;
  conversation: ChatConversation;
  ownerId: string;
  projectId: string;
  userMessage: ChatMessage;
}) {
  const latestUserPrompt = normalizeLabel(args.userMessage.content);
  const normalizedAssistant = normalizeLabel(args.assistantMessage);
  const candidates: Array<{
    confidence: number;
    content: string;
    conversationId: string | null;
    memoryType: ChatMemoryRecord["memoryType"];
    metadataJson?: Record<string, unknown>;
    scope: ChatMemoryRecord["scope"];
    scopeId: string;
    title: string;
    verificationStatus: ChatMemoryRecord["verificationStatus"];
  }> = [];

  if (normalizedAssistant) {
    candidates.push({
      confidence: 0.78,
      content: truncateLabel(args.assistantMessage.replace(/\s+/g, " ").trim(), 320),
      conversationId: args.conversation.id,
      memoryType: "summary",
      scope: "project",
      scopeId: args.projectId,
      title: "Project summary",
      verificationStatus: "unverified",
    });
    candidates.push({
      confidence: 0.72,
      content: truncateLabel(
        `Latest thread context: ${args.userMessage.content.trim()} ${args.assistantMessage.trim()}`,
        320,
      ),
      conversationId: args.conversation.id,
      memoryType: "summary",
      scope: "thread",
      scopeId: args.conversation.id,
      title: `Thread summary: ${args.conversation.label}`,
      verificationStatus: "unverified",
    });
  }

  const goalMatch = latestUserPrompt.match(
    /\b(?:i want to|help me|i need to|my goal is to|i'm trying to)\s+(.+)/i,
  );

  if (goalMatch?.[1]) {
    candidates.push({
      confidence: 0.84,
      content: truncateLabel(goalMatch[1], 220),
      conversationId: args.conversation.id,
      memoryType: "goal",
      scope: "project",
      scopeId: args.projectId,
      title: "Current goal",
      verificationStatus: "unverified",
    });
  }

  const preferenceMatch = latestUserPrompt.match(/\b(?:i prefer|please use|focus on)\s+(.+)/i);

  if (preferenceMatch?.[1]) {
    candidates.push({
      confidence: 0.82,
      content: truncateLabel(preferenceMatch[1], 220),
      conversationId: args.conversation.id,
      memoryType: "preference",
      scope: "project",
      scopeId: args.projectId,
      title: "Working preference",
      verificationStatus: "unverified",
    });
  }

  const constraintMatch = latestUserPrompt.match(/\b(?:must|cannot|can't|should not|only)\s+(.+)/i);

  if (constraintMatch?.[1]) {
    candidates.push({
      confidence: 0.8,
      content: truncateLabel(constraintMatch[1], 220),
      conversationId: args.conversation.id,
      memoryType: "constraint",
      scope: "project",
      scopeId: args.projectId,
      title: "Active constraint",
      verificationStatus: "unverified",
    });
  }

  if (args.userMessage.content.trim().endsWith("?")) {
    candidates.push({
      confidence: 0.74,
      content: truncateLabel(args.userMessage.content.trim(), 220),
      conversationId: args.conversation.id,
      memoryType: "task",
      metadataJson: { status: "unresolved" },
      scope: "thread",
      scopeId: args.conversation.id,
      title: "Open question",
      verificationStatus: "unverified",
    });
  }

  return candidates;
}

async function upsertMemoryCandidate(
  queryable: DatabaseQueryable,
  args: {
    candidate: ReturnType<typeof buildMemoryCandidates>[number];
    ownerId: string;
    projectId: string;
    sourceMessageIds: string[];
  },
) {
  const existing = await queryOptional<MemoryRow>(
    queryable,
    `
      SELECT *
      FROM chat_memory_records
      WHERE owner_id = $1
        AND scope = $2
        AND scope_id = $3
        AND memory_type = $4
        AND title = $5
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [
      args.ownerId,
      args.candidate.scope,
      args.candidate.scopeId,
      args.candidate.memoryType,
      args.candidate.title,
    ],
  );

  if (existing) {
    await queryable.query(
      `
        UPDATE chat_memory_records
        SET
          content = $2,
          confidence = $3,
          source_message_ids = $4::text[],
          verification_status = $5,
          metadata_json = $6::jsonb,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        existing.id,
        args.candidate.content,
        args.candidate.confidence,
        args.sourceMessageIds,
        args.candidate.verificationStatus,
        JSON.stringify(args.candidate.metadataJson ?? {}),
      ],
    );

    await insertAuditEvent(queryable, {
      actorId: args.ownerId,
      entityId: existing.id,
      entityType: "memory_record",
      eventType: "memory.updated",
      ownerId: args.ownerId,
      payloadJson: {
        memoryType: args.candidate.memoryType,
        scope: args.candidate.scope,
        scopeId: args.candidate.scopeId,
        sourceMessageIds: args.sourceMessageIds,
      },
      summary: `Updated ${args.candidate.memoryType} memory "${args.candidate.title}".`,
    });

    return existing.id;
  }

  const memoryId = createEntityId("memory");

  await queryable.query(
    `
      INSERT INTO chat_memory_records (
        id,
        owner_id,
        project_id,
        conversation_id,
        scope,
        scope_id,
        memory_type,
        title,
        content,
        confidence,
        source_message_ids,
        verification_status,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13::jsonb)
    `,
    [
      memoryId,
      args.ownerId,
      args.projectId,
      args.candidate.conversationId,
      args.candidate.scope,
      args.candidate.scopeId,
      args.candidate.memoryType,
      args.candidate.title,
      args.candidate.content,
      args.candidate.confidence,
      args.sourceMessageIds,
      args.candidate.verificationStatus,
      JSON.stringify(args.candidate.metadataJson ?? {}),
    ],
  );

  await insertAuditEvent(queryable, {
    actorId: args.ownerId,
    entityId: memoryId,
    entityType: "memory_record",
    eventType: "memory.created",
    ownerId: args.ownerId,
    payloadJson: {
      memoryType: args.candidate.memoryType,
      scope: args.candidate.scope,
      scopeId: args.candidate.scopeId,
      sourceMessageIds: args.sourceMessageIds,
    },
    summary: `Saved ${args.candidate.memoryType} memory "${args.candidate.title}".`,
  });

  return memoryId;
}

async function loadProjectCheckpointState(
  queryable: DatabaseQueryable,
  args: { ownerId: string; projectId: string },
) {
  const project = await requireProjectRow(queryable, args.ownerId, args.projectId);
  const conversations = await queryable.query<ConversationRow>(
    `
      SELECT *
      FROM chat_conversations
      WHERE owner_id = $1
        AND project_id = $2
        AND archived_at IS NULL
      ORDER BY created_at ASC
    `,
    [args.ownerId, args.projectId],
  );
  const messages = await queryable.query<MessageRow>(
    `
      SELECT m.*
      FROM chat_messages m
      INNER JOIN chat_conversations c ON c.id = m.conversation_id
      WHERE m.owner_id = $1
        AND c.project_id = $2
      ORDER BY m.created_at ASC
    `,
    [args.ownerId, args.projectId],
  );
  const attachments = await queryable.query<AttachmentRow>(
    `
      SELECT *
      FROM chat_attachments
      WHERE owner_id = $1
        AND project_id = $2
      ORDER BY created_at ASC
    `,
    [args.ownerId, args.projectId],
  );
  const memoryRecords = await queryable.query<MemoryRow>(
    `
      SELECT *
      FROM chat_memory_records
      WHERE owner_id = $1
        AND project_id = $2
      ORDER BY updated_at DESC
    `,
    [args.ownerId, args.projectId],
  );

  const pendingTasks = memoryRecords.rows
    .filter(
      (record) =>
        record.memory_type === "task" &&
        (record.metadata_json?.status === undefined || record.metadata_json?.status === "unresolved"),
    )
    .map((record) => record.content);
  const completedTasks = memoryRecords.rows
    .filter(
      (record) =>
        record.memory_type === "task" && record.metadata_json?.status === "completed",
    )
    .map((record) => record.content);

  return checkpointStateSchema.parse({
    attachments: attachments.rows.map((row) => ({
      conversationId: row.conversation_id,
      createdAt: formatIso(row.created_at)!,
      extension: row.extension,
      id: row.id,
      messageId: row.message_id,
      metadataJson: row.metadata_json ?? {},
      mimeType: row.mime_type,
      originalName: row.original_name,
      ownerId: row.owner_id,
      previewKind: row.preview_kind,
      projectId: row.project_id,
      scanStatus: row.scan_status,
      sizeBytes: Number(row.size_bytes),
      status: row.status,
      storageKey: row.storage_key,
      updatedAt: formatIso(row.updated_at)!,
    })),
    completedTasks,
    conversations: conversations.rows.map((row) => ({
      archivedAt: formatIso(row.archived_at),
      createdAt: formatIso(row.created_at)!,
      id: row.id,
      labelSource: row.label_source,
      lastMessageAt: formatIso(row.last_message_at),
      ownerId: row.owner_id,
      projectId: row.project_id,
      status: row.status,
      title: row.title,
      updatedAt: formatIso(row.updated_at)!,
    })),
    generatedArtifactReferences: attachments.rows.map((row) => ({
      attachmentId: row.id,
      messageId: row.message_id,
      originalName: row.original_name,
    })),
    memoryRecords: memoryRecords.rows.map((row) => ({
      confidence: Number(row.confidence),
      content: row.content,
      conversationId: row.conversation_id,
      createdAt: formatIso(row.created_at)!,
      id: row.id,
      memoryType: row.memory_type,
      metadataJson: row.metadata_json ?? {},
      ownerId: row.owner_id,
      projectId: row.project_id,
      scope: row.scope,
      scopeId: row.scope_id,
      sourceMessageIds: row.source_message_ids ?? [],
      title: row.title,
      updatedAt: formatIso(row.updated_at)!,
      verificationStatus: row.verification_status,
    })),
    messages: messages.rows.map((row) => ({
      clientRequestId: row.client_request_id,
      content: row.content,
      conversationId: row.conversation_id,
      createdAt: formatIso(row.created_at)!,
      error: row.error,
      id: row.id,
      metadataJson: row.metadata_json ?? {},
      ownerId: row.owner_id,
      replyToMessageId: row.reply_to_message_id,
      role: row.role,
      sequenceNumber: row.sequence_number,
      structuredPayload: row.structured_payload ?? {},
      toolCalls: row.tool_calls ?? [],
    })),
    pendingTasks,
    project: {
      archivedAt: formatIso(project.archived_at),
      createdAt: formatIso(project.created_at)!,
      id: project.id,
      lastCheckpointAt: formatIso(project.last_checkpoint_at),
      lastMessageAt: formatIso(project.last_message_at),
      lastSavedAt: formatIso(project.last_saved_at),
      latestSummary: project.latest_summary,
      metadataJson: project.metadata_json ?? {},
      organizationId: project.organization_id,
      ownerId: project.owner_id,
      status: project.status,
      title: project.title,
      updatedAt: formatIso(project.updated_at)!,
    },
    workflowState: {
      activeThreadIds: conversations.rows.map((row) => row.id),
      conversationCount: conversations.rows.length,
      latestSummary: project.latest_summary,
      messageCount: messages.rows.length,
    },
  });
}

async function createCheckpointWithinTransaction(
  queryable: DatabaseQueryable,
  args: {
    checkpointType: ChatCheckpoint["checkpointType"];
    conversationId: string | null;
    createdBy: string;
    ownerId: string;
    projectId: string;
    summary: string;
    title: string;
  },
) {
  const checkpointId = createEntityId("checkpoint");
  const state = await loadProjectCheckpointState(queryable, {
    ownerId: args.ownerId,
    projectId: args.projectId,
  });

  await queryable.query(
    `
      INSERT INTO chat_checkpoints (
        id,
        owner_id,
        project_id,
        conversation_id,
        checkpoint_type,
        title,
        summary,
        serialized_state_json,
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
    `,
    [
      checkpointId,
      args.ownerId,
      args.projectId,
      args.conversationId,
      args.checkpointType,
      args.title,
      args.summary,
      JSON.stringify(state),
      args.createdBy,
    ],
  );

  await queryable.query(
    `
      UPDATE chat_projects
      SET
        last_checkpoint_at = NOW(),
        last_saved_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [args.projectId],
  );

  await insertAuditEvent(queryable, {
    actorId: args.createdBy,
    entityId: checkpointId,
    entityType: "checkpoint",
    eventType: "checkpoint.created",
    ownerId: args.ownerId,
    payloadJson: {
      checkpointType: args.checkpointType,
      conversationId: args.conversationId,
      projectId: args.projectId,
    },
    summary: args.summary,
  });

  return chatCheckpointSchema.parse({
    checkpointType: args.checkpointType,
    conversationId: args.conversationId,
    createdAt: nowIso(),
    createdBy: args.createdBy,
    id: checkpointId,
    projectId: args.projectId,
    restoredAt: null,
    summary: args.summary,
    title: args.title,
  });
}

async function createMemoryJob(
  queryable: DatabaseQueryable,
  args: {
    conversationId: string;
    ownerId: string;
    payloadJson?: Record<string, unknown>;
    projectId: string;
    triggerMessageId: string;
  },
) {
  const jobId = createEntityId("memoryjob");

  await queryable.query(
    `
      INSERT INTO chat_memory_jobs (
        id,
        owner_id,
        project_id,
        conversation_id,
        trigger_message_id,
        status,
        attempts,
        payload_json
      )
      VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6::jsonb)
    `,
    [
      jobId,
      args.ownerId,
      args.projectId,
      args.conversationId,
      args.triggerMessageId,
      JSON.stringify(args.payloadJson ?? {}),
    ],
  );

  return jobId;
}

async function completeMemoryJob(
  queryable: DatabaseQueryable,
  jobId: string,
  status: MemoryJobRow["status"],
  errorMessage?: string,
) {
  await queryable.query(
    `
      UPDATE chat_memory_jobs
      SET
        status = $2,
        attempts = attempts + 1,
        error_message = $3,
        last_attempt_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [jobId, status, errorMessage ?? null],
  );
}

async function runPostAssistantPersistence(args: {
  assistantMessageId: string;
  conversationId: string;
  ownerId: string;
  projectId: string;
}) {
  const pool = getDatabasePool();

  await withDatabaseTransaction(async (client) => {
    const jobId = await createMemoryJob(client, {
      conversationId: args.conversationId,
      ownerId: args.ownerId,
      payloadJson: {
        assistantMessageId: args.assistantMessageId,
        projectId: args.projectId,
      },
      projectId: args.projectId,
      triggerMessageId: args.assistantMessageId,
    });

    try {
      const snapshot = await buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
      const conversation = requireConversationFromSnapshot(snapshot, args.conversationId);
      const assistantMessage = conversation.messages.find(
        (message) => message.id === args.assistantMessageId,
      );
      const userMessage =
        [...conversation.messages]
          .reverse()
          .find(
            (message) =>
              message.role === "user" &&
              conversation.messages.find(
                (candidate) =>
                  candidate.id === args.assistantMessageId &&
                  candidate.role === "assistant",
              ),
          ) ?? null;

      if (!assistantMessage || !userMessage) {
        await completeMemoryJob(client, jobId, "completed");
        return;
      }

      const memoryCandidates = buildMemoryCandidates({
        assistantMessage: assistantMessage.content,
        conversation,
        ownerId: args.ownerId,
        projectId: args.projectId,
        userMessage,
      });

      for (const candidate of memoryCandidates) {
        await upsertMemoryCandidate(client, {
          candidate,
          ownerId: args.ownerId,
          projectId: args.projectId,
          sourceMessageIds: [userMessage.id, assistantMessage.id],
        });
      }

      const latestSummary =
        memoryCandidates.find(
          (candidate) =>
            candidate.memoryType === "summary" && candidate.scope === "project",
        )?.content ?? assistantMessage.content;

      await client.query(
        `
          UPDATE chat_projects
          SET
            latest_summary = $2,
            last_saved_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [args.projectId, truncateLabel(latestSummary, 320)],
      );

      const messageCountResult = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM chat_messages m
          INNER JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE m.owner_id = $1
            AND c.project_id = $2
        `,
        [args.ownerId, args.projectId],
      );
      const totalMessages = Number(messageCountResult.rows[0]?.count ?? 0);

      if (
        totalMessages === 2 ||
        (totalMessages > 0 && totalMessages % autoCheckpointMessageInterval === 0)
      ) {
        await createCheckpointWithinTransaction(client, {
          checkpointType: "auto",
          conversationId: args.conversationId,
          createdBy: args.ownerId,
          ownerId: args.ownerId,
          projectId: args.projectId,
          summary: "Auto-saved project checkpoint after a completed conversation turn.",
          title: "Automatic checkpoint",
        });
      }

      await completeMemoryJob(client, jobId, "completed");
    } catch (error) {
      await completeMemoryJob(
        client,
        jobId,
        "dead_letter",
        error instanceof Error ? error.message : "Memory extraction failed.",
      );
      await insertAuditEvent(client, {
        actorId: args.ownerId,
        entityId: jobId,
        entityType: "memory_job",
        eventType: "memory.dead_letter",
        ownerId: args.ownerId,
        payloadJson: {
          assistantMessageId: args.assistantMessageId,
          projectId: args.projectId,
          conversationId: args.conversationId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        summary: "A memory extraction job failed and was moved to the dead-letter queue.",
      });
    }
  });

  await pool.query("SELECT 1");
}

export async function getPersistentChatWorkspaceSnapshot(args: { ownerId: string }) {
  return withDatabaseTransaction(async (client) =>
    buildWorkspaceSnapshotFromQueryable(client, args.ownerId),
  );
}

export async function createPersistentChatProject(args: {
  label?: string;
  ownerId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await ensureOwnerWorkspace(client, args.ownerId);
    const existingProjects = await client.query<ProjectRow>(
      `
        SELECT *
        FROM chat_projects
        WHERE owner_id = $1
          AND archived_at IS NULL
        ORDER BY created_at ASC
      `,
      [args.ownerId],
    );
    const normalizedLabel = args.label ? normalizeLabel(args.label) : "";
    const projectId = createEntityId("project");

    await client.query(
      `
        INSERT INTO chat_projects (
          id,
          owner_id,
          title,
          status,
          last_saved_at
        )
        VALUES ($1, $2, $3, 'active', NOW())
      `,
      [
        projectId,
        args.ownerId,
        normalizedLabel || buildProjectTitle(existingProjects.rows),
      ],
    );

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: projectId,
      entityType: "project",
      eventType: "project.created",
      ownerId: args.ownerId,
      payloadJson: { title: normalizedLabel || buildProjectTitle(existingProjects.rows) },
      summary: "Created a new project.",
    });

    return buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
  });
}

export async function renamePersistentChatProject(args: {
  label: string;
  ownerId: string;
  projectId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await requireProjectRow(client, args.ownerId, args.projectId);
    const normalizedLabel = normalizeLabel(args.label);

    await client.query(
      `
        UPDATE chat_projects
        SET
          title = $2,
          last_saved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [args.projectId, normalizedLabel],
    );

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: args.projectId,
      entityType: "project",
      eventType: "project.renamed",
      ownerId: args.ownerId,
      payloadJson: { label: normalizedLabel },
      summary: `Renamed project to "${normalizedLabel}".`,
    });

    return buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
  });
}

export async function deletePersistentChatProject(args: {
  ownerId: string;
  projectId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await requireProjectRow(client, args.ownerId, args.projectId);

    await createCheckpointWithinTransaction(client, {
      checkpointType: "pre_tool",
      conversationId: null,
      createdBy: args.ownerId,
      ownerId: args.ownerId,
      projectId: args.projectId,
      summary: "Created a backup checkpoint before deleting the project.",
      title: "Pre-delete backup",
    });

    await client.query("DELETE FROM chat_projects WHERE id = $1", [args.projectId]);

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: args.projectId,
      entityType: "project",
      eventType: "project.archived",
      ownerId: args.ownerId,
      summary: "Deleted a project and its linked conversations.",
    });

    await ensureOwnerWorkspace(client, args.ownerId);

    return buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
  });
}

export async function renamePersistentChatConversation(args: {
  conversationId: string;
  label: string;
  ownerId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await requireConversationRow(client, args.ownerId, args.conversationId);
    const normalizedLabel = normalizeLabel(args.label);

    await client.query(
      `
        UPDATE chat_conversations
        SET
          title = $2,
          label_source = 'manual',
          updated_at = NOW()
        WHERE id = $1
      `,
      [args.conversationId, normalizedLabel],
    );

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: args.conversationId,
      entityType: "conversation",
      eventType: "conversation.renamed",
      ownerId: args.ownerId,
      payloadJson: { label: normalizedLabel },
      summary: `Renamed a chat to "${normalizedLabel}".`,
    });

    return buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
  });
}

export async function deletePersistentChatConversation(args: {
  conversationId: string;
  ownerId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const conversation = await requireConversationRow(client, args.ownerId, args.conversationId);

    await createCheckpointWithinTransaction(client, {
      checkpointType: "pre_tool",
      conversationId: conversation.id,
      createdBy: args.ownerId,
      ownerId: args.ownerId,
      projectId: conversation.project_id,
      summary: "Created a backup checkpoint before deleting a chat.",
      title: "Pre-delete chat backup",
    });

    await client.query("DELETE FROM chat_conversations WHERE id = $1", [args.conversationId]);
    await client.query(
      `
        UPDATE chat_projects
        SET
          last_saved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `,
      [conversation.project_id],
    );

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: args.conversationId,
      entityType: "conversation",
      eventType: "conversation.deleted",
      ownerId: args.ownerId,
      payloadJson: { projectId: conversation.project_id },
      summary: "Deleted a chat conversation.",
    });

    return buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
  });
}

export async function createPersistentChatAttachmentRecord(args: {
  extension: string;
  mimeType: string;
  originalName: string;
  ownerId: string;
  previewKind: ChatAttachment["previewKind"];
  sizeBytes: number;
  storageKey: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await ensureOwnerWorkspace(client, args.ownerId);
    const attachmentId = createEntityId("attachment");

    await client.query(
      `
        INSERT INTO chat_attachments (
          id,
          owner_id,
          original_name,
          mime_type,
          extension,
          preview_kind,
          status,
          scan_status,
          storage_key,
          size_bytes
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', 'pending', $7, $8)
      `,
      [
        attachmentId,
        args.ownerId,
        args.originalName,
        args.mimeType,
        args.extension,
        args.previewKind,
        args.storageKey,
        args.sizeBytes,
      ],
    );

    const row = await requireAttachmentRow(client, args.ownerId, attachmentId);

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: attachmentId,
      entityType: "attachment",
      eventType: "attachment.uploaded",
      ownerId: args.ownerId,
      payloadJson: {
        mimeType: args.mimeType,
        originalName: args.originalName,
        sizeBytes: args.sizeBytes,
      },
      summary: `Uploaded attachment "${args.originalName}".`,
    });

    return {
      attachment: mapAttachmentRow(row),
      storageKey: row.storage_key,
    };
  });
}

export async function deletePersistentPendingChatAttachment(args: {
  attachmentId: string;
  ownerId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const attachment = await requireAttachmentRow(client, args.ownerId, args.attachmentId);

    if (attachment.message_id) {
      throw buildApiError({
        correlationId: `chat_attachment_${args.attachmentId}`,
        details: { attachmentId: args.attachmentId },
        errorCode: "CONFLICT",
        message: "Sent attachments cannot be deleted from the composer.",
        status: 409,
      });
    }

    await client.query("DELETE FROM chat_attachments WHERE id = $1", [args.attachmentId]);

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: args.attachmentId,
      entityType: "attachment",
      eventType: "attachment.deleted",
      ownerId: args.ownerId,
      summary: `Removed pending attachment "${attachment.original_name}".`,
    });

    return attachment.storage_key;
  });
}

export async function getPersistentChatAttachmentRecord(args: {
  attachmentId: string;
  ownerId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const attachment = await requireAttachmentRow(client, args.ownerId, args.attachmentId);

    return {
      attachment: mapAttachmentRow(attachment),
      storageKey: attachment.storage_key,
    };
  });
}

export async function createPersistentUserChatMessage(args: {
  attachmentIds: string[];
  clientRequestId?: string;
  conversationId?: string | null;
  message: string;
  ownerId: string;
  projectId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await ensureOwnerWorkspace(client, args.ownerId);
    await requireProjectRow(client, args.ownerId, args.projectId);

    if (args.clientRequestId) {
      const existingMessage = await queryOptional<MessageRow>(
        client,
        `
          SELECT *
          FROM chat_messages
          WHERE owner_id = $1
            AND client_request_id = $2
          LIMIT 1
        `,
        [args.ownerId, args.clientRequestId],
      );

      if (existingMessage) {
        const existingAssistantReply = await queryOptional<MessageRow>(
          client,
          `
            SELECT *
            FROM chat_messages
            WHERE owner_id = $1
              AND reply_to_message_id = $2
            ORDER BY created_at ASC
            LIMIT 1
          `,
          [args.ownerId, existingMessage.id],
        );
        const snapshot = await buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
        const conversation = requireConversationFromSnapshot(snapshot, existingMessage.conversation_id);
        const assistantMessage = existingAssistantReply
          ? conversation.messages.find((candidate) => candidate.id === existingAssistantReply.id) ?? null
          : null;

        return {
          assistantMessage,
          conversation,
          userMessage: requireMessageFromConversation(conversation, existingMessage.id),
          workspace: snapshot,
        };
      }
    }

    const pendingAttachments = await requirePendingAttachments(
      client,
      args.ownerId,
      args.attachmentIds,
    );
    const timestamp = nowIso();
    let conversation =
      args.conversationId
        ? await queryOptional<ConversationRow>(
            client,
            `
              SELECT *
              FROM chat_conversations
              WHERE owner_id = $1
                AND id = $2
                AND archived_at IS NULL
            `,
            [args.ownerId, args.conversationId],
          )
        : null;

    if (!conversation) {
      const conversationId = createEntityId("conversation");

      await client.query(
        `
          INSERT INTO chat_conversations (
            id,
            project_id,
            owner_id,
            title,
            label_source,
            status,
            last_message_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'auto', 'active', $5::timestamptz, $5::timestamptz, $5::timestamptz)
        `,
        [
          conversationId,
          args.projectId,
          args.ownerId,
          buildConversationTitle({
            attachments: pendingAttachments,
            message: args.message,
          }),
          timestamp,
        ],
      );

      conversation = await requireConversationRow(client, args.ownerId, conversationId);

      await insertAuditEvent(client, {
        actorId: args.ownerId,
        entityId: conversationId,
        entityType: "conversation",
        eventType: "thread.created",
        ownerId: args.ownerId,
        payloadJson: { projectId: args.projectId },
        summary: "Started a new chat thread.",
      });
    }

    if (conversation.project_id !== args.projectId) {
      throw buildApiError({
        correlationId: `chat_conversation_project_${conversation.id}`,
        details: {
          conversationId: conversation.id,
          projectId: args.projectId,
        },
        errorCode: "CONFLICT",
        message: "Conversation is linked to a different project.",
        status: 409,
      });
    }

    const messageId = createEntityId("message");
    const sequenceNumber = await getNextSequenceNumber(client, conversation.id);

    await client.query(
      `
        INSERT INTO chat_messages (
          id,
          conversation_id,
          owner_id,
          role,
          content,
          client_request_id,
          sequence_number,
          created_at
        )
        VALUES ($1, $2, $3, 'user', $4, $5, $6, $7::timestamptz)
      `,
      [
        messageId,
        conversation.id,
        args.ownerId,
        args.message,
        args.clientRequestId ?? null,
        sequenceNumber,
        timestamp,
      ],
    );

    for (const attachment of pendingAttachments) {
      await client.query(
        `
          UPDATE chat_attachments
          SET
            project_id = $2,
            conversation_id = $3,
            message_id = $4,
            scan_status = 'not_scanned',
            status = 'attached',
            updated_at = $5::timestamptz
          WHERE id = $1
        `,
        [attachment.id, args.projectId, conversation.id, messageId, timestamp],
      );
    }

    await client.query(
      `
        UPDATE chat_conversations
        SET
          last_message_at = $2::timestamptz,
          updated_at = $2::timestamptz
        WHERE id = $1
      `,
      [conversation.id, timestamp],
    );
    await client.query(
      `
        UPDATE chat_projects
        SET
          last_message_at = $2::timestamptz,
          last_saved_at = $2::timestamptz,
          updated_at = $2::timestamptz
        WHERE id = $1
      `,
      [args.projectId, timestamp],
    );

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: messageId,
      entityType: "message",
      eventType: "message.created",
      ownerId: args.ownerId,
      payloadJson: {
        attachmentIds: args.attachmentIds,
        conversationId: conversation.id,
        projectId: args.projectId,
      },
      summary: "Saved a user message.",
    });

    const snapshot = await buildWorkspaceSnapshotFromQueryable(client, args.ownerId);
    const conversationSnapshot = requireConversationFromSnapshot(snapshot, conversation.id);

    return {
      assistantMessage: null,
      conversation: conversationSnapshot,
      userMessage: requireMessageFromConversation(conversationSnapshot, messageId),
      workspace: snapshot,
    };
  });
}

export async function createPersistentAssistantChatMessage(args: {
  content: string;
  conversationId: string;
  error?: boolean;
  ownerId: string;
  replyToMessageId?: string | null;
}) {
  const result = await withDatabaseTransaction(async (client) => {
    const conversation = await requireConversationRow(client, args.ownerId, args.conversationId);
    const timestamp = nowIso();
    const messageId = createEntityId("message");
    const sequenceNumber = await getNextSequenceNumber(client, conversation.id);

    await client.query(
      `
        INSERT INTO chat_messages (
          id,
          conversation_id,
          owner_id,
          role,
          content,
          reply_to_message_id,
          error,
          sequence_number,
          created_at
        )
        VALUES ($1, $2, $3, 'assistant', $4, $5, $6, $7, $8::timestamptz)
      `,
      [
        messageId,
        conversation.id,
        args.ownerId,
        args.content,
        args.replyToMessageId ?? null,
        args.error ?? false,
        sequenceNumber,
        timestamp,
      ],
    );

    await client.query(
      `
        UPDATE chat_conversations
        SET
          last_message_at = $2::timestamptz,
          updated_at = $2::timestamptz
        WHERE id = $1
      `,
      [conversation.id, timestamp],
    );
    await client.query(
      `
        UPDATE chat_projects
        SET
          last_message_at = $2::timestamptz,
          last_saved_at = $2::timestamptz,
          updated_at = $2::timestamptz
        WHERE id = $1
      `,
      [conversation.project_id, timestamp],
    );

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: messageId,
      entityType: "message",
      eventType: "message.completed",
      ownerId: args.ownerId,
      payloadJson: {
        conversationId: conversation.id,
        error: args.error ?? false,
        projectId: conversation.project_id,
        replyToMessageId: args.replyToMessageId ?? null,
      },
      summary: "Saved an assistant response.",
    });

    return {
      assistantMessageId: messageId,
      projectId: conversation.project_id,
    };
  });

  try {
    await runPostAssistantPersistence({
      assistantMessageId: result.assistantMessageId,
      conversationId: args.conversationId,
      ownerId: args.ownerId,
      projectId: result.projectId,
    });
  } catch (error) {
    console.error("Persistent chat follow-up processing failed", error);
  }

  const workspace = await getPersistentChatWorkspaceSnapshot({ ownerId: args.ownerId });
  const conversation = requireConversationFromSnapshot(workspace, args.conversationId);

  return {
    assistantMessage: requireMessageFromConversation(conversation, result.assistantMessageId),
    conversation,
    workspace,
  };
}

export async function createManualChatCheckpoint(args: {
  conversationId?: string | null;
  ownerId: string;
  projectId: string;
  title?: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await requireProjectRow(client, args.ownerId, args.projectId);
    const checkpoint = await createCheckpointWithinTransaction(client, {
      checkpointType: "manual",
      conversationId: args.conversationId ?? null,
      createdBy: args.ownerId,
      ownerId: args.ownerId,
      projectId: args.projectId,
      summary: "Saved a manual checkpoint for the current project state.",
      title: args.title?.trim() || "Manual checkpoint",
    });

    return {
      checkpoint,
      workspace: await buildWorkspaceSnapshotFromQueryable(client, args.ownerId),
    };
  });
}

export async function getPersistentChatProjectActivity(args: {
  ownerId: string;
  projectId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const project = await requireProjectRow(client, args.ownerId, args.projectId);
    const [eventsResult, checkpointsResult, memoryResult] = await Promise.all([
      client.query<AuditEventRow>(
        `
          SELECT *
          FROM chat_audit_events
          WHERE owner_id = $1
            AND (
              (entity_type = 'project' AND entity_id = $2)
              OR payload_json ->> 'projectId' = $2
            )
          ORDER BY created_at DESC
          LIMIT ${maxActivityEvents}
        `,
        [args.ownerId, args.projectId],
      ),
      client.query<CheckpointRow>(
        `
          SELECT *
          FROM chat_checkpoints
          WHERE owner_id = $1
            AND project_id = $2
          ORDER BY created_at DESC
          LIMIT ${maxActivityCheckpoints}
        `,
        [args.ownerId, args.projectId],
      ),
      client.query<MemoryRow>(
        `
          SELECT *
          FROM chat_memory_records
          WHERE owner_id = $1
            AND project_id = $2
          ORDER BY updated_at DESC
          LIMIT ${maxActivityMemories}
        `,
        [args.ownerId, args.projectId],
      ),
    ]);

    return chatProjectActivitySnapshotSchema.parse({
      checkpoints: checkpointsResult.rows.map(mapCheckpointRow),
      events: eventsResult.rows.map(mapAuditEventRow),
      memoryRecords: memoryResult.rows.map(mapMemoryRow),
      project: mapProjectRow(project),
    });
  });
}

export async function restorePersistentChatCheckpoint(args: {
  checkpointId: string;
  ownerId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const checkpoint = await queryOptional<CheckpointRow>(
      client,
      `
        SELECT *
        FROM chat_checkpoints
        WHERE owner_id = $1
          AND id = $2
      `,
      [args.ownerId, args.checkpointId],
    );

    if (!checkpoint) {
      throw buildApiError({
        correlationId: `chat_checkpoint_${args.checkpointId}`,
        details: { checkpointId: args.checkpointId },
        errorCode: "NOT_FOUND",
        message: "Checkpoint was not found.",
        status: 404,
      });
    }

    await createCheckpointWithinTransaction(client, {
      checkpointType: "pre_tool",
      conversationId: checkpoint.conversation_id,
      createdBy: args.ownerId,
      ownerId: args.ownerId,
      projectId: checkpoint.project_id,
      summary: "Created a backup checkpoint before restoring an earlier state.",
      title: "Pre-restore backup",
    });

    const state = checkpointStateSchema.parse(checkpoint.serialized_state_json);

    await client.query("DELETE FROM chat_memory_records WHERE project_id = $1", [checkpoint.project_id]);
    await client.query(
      `
        DELETE FROM chat_attachments
        WHERE project_id = $1
      `,
      [checkpoint.project_id],
    );
    await client.query(
      `
        DELETE FROM chat_messages
        WHERE conversation_id IN (
          SELECT id
          FROM chat_conversations
          WHERE project_id = $1
        )
      `,
      [checkpoint.project_id],
    );
    await client.query("DELETE FROM chat_conversations WHERE project_id = $1", [checkpoint.project_id]);

    await client.query(
      `
        UPDATE chat_projects
        SET
          title = $2,
          status = $3,
          latest_summary = $4,
          metadata_json = $5::jsonb,
          last_message_at = $6::timestamptz,
          last_saved_at = NOW(),
          updated_at = NOW(),
          archived_at = $7::timestamptz
        WHERE id = $1
      `,
      [
        checkpoint.project_id,
        state.project.title,
        state.project.status,
        state.project.latestSummary,
        JSON.stringify(state.project.metadataJson),
        state.project.lastMessageAt,
        state.project.archivedAt,
      ],
    );

    for (const conversation of state.conversations) {
      await client.query(
        `
          INSERT INTO chat_conversations (
            id,
            project_id,
            owner_id,
            title,
            label_source,
            status,
            last_message_at,
            created_at,
            updated_at,
            archived_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::timestamptz)
        `,
        [
          conversation.id,
          checkpoint.project_id,
          conversation.ownerId,
          conversation.title,
          conversation.labelSource,
          conversation.status,
          conversation.lastMessageAt,
          conversation.createdAt,
          conversation.updatedAt,
          conversation.archivedAt,
        ],
      );
    }

    for (const message of state.messages) {
      await client.query(
        `
          INSERT INTO chat_messages (
            id,
            conversation_id,
            owner_id,
            role,
            content,
            structured_payload,
            tool_calls,
            metadata_json,
            client_request_id,
            reply_to_message_id,
            error,
            sequence_number,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13::timestamptz)
        `,
        [
          message.id,
          message.conversationId,
          message.ownerId,
          message.role,
          message.content,
          JSON.stringify(message.structuredPayload),
          JSON.stringify(message.toolCalls),
          JSON.stringify(message.metadataJson),
          message.clientRequestId,
          message.replyToMessageId,
          message.error,
          message.sequenceNumber,
          message.createdAt,
        ],
      );
    }

    for (const attachment of state.attachments) {
      await client.query(
        `
          INSERT INTO chat_attachments (
            id,
            owner_id,
            project_id,
            conversation_id,
            message_id,
            original_name,
            mime_type,
            extension,
            preview_kind,
            status,
            scan_status,
            storage_key,
            size_bytes,
            metadata_json,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::timestamptz, $16::timestamptz)
        `,
        [
          attachment.id,
          attachment.ownerId,
          checkpoint.project_id,
          attachment.conversationId,
          attachment.messageId,
          attachment.originalName,
          attachment.mimeType,
          attachment.extension,
          attachment.previewKind,
          attachment.status,
          attachment.scanStatus,
          attachment.storageKey,
          attachment.sizeBytes,
          JSON.stringify(attachment.metadataJson),
          attachment.createdAt,
          attachment.updatedAt,
        ],
      );
    }

    for (const memory of state.memoryRecords) {
      await client.query(
        `
          INSERT INTO chat_memory_records (
            id,
            owner_id,
            project_id,
            conversation_id,
            scope,
            scope_id,
            memory_type,
            title,
            content,
            confidence,
            source_message_ids,
            verification_status,
            metadata_json,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13::jsonb, $14::timestamptz, $15::timestamptz)
        `,
        [
          memory.id,
          memory.ownerId,
          checkpoint.project_id,
          memory.conversationId,
          memory.scope,
          memory.scopeId,
          memory.memoryType,
          memory.title,
          memory.content,
          memory.confidence,
          memory.sourceMessageIds,
          memory.verificationStatus,
          JSON.stringify(memory.metadataJson),
          memory.createdAt,
          memory.updatedAt,
        ],
      );
    }

    await client.query(
      `
        UPDATE chat_checkpoints
        SET restored_at = NOW()
        WHERE id = $1
      `,
      [checkpoint.id],
    );

    await insertAuditEvent(client, {
      actorId: args.ownerId,
      entityId: checkpoint.id,
      entityType: "checkpoint",
      eventType: "checkpoint.restored",
      ownerId: args.ownerId,
      payloadJson: {
        projectId: checkpoint.project_id,
      },
      summary: "Restored project state from a checkpoint.",
    });

    return {
      checkpoint: mapCheckpointRow({
        ...checkpoint,
        restored_at: new Date().toISOString(),
      }),
      workspace: await buildWorkspaceSnapshotFromQueryable(client, args.ownerId),
    };
  });
}
