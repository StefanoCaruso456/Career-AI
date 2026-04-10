import { createHash } from "node:crypto";
import {
  ApiError,
  chatAttachmentLimits,
  emptyChatWorkspacePersistence,
  chatWorkspaceSnapshotSchema,
  formatChatAttachmentSize,
  type ChatAttachment,
  type ChatConversation,
  type ChatMessage,
  type ChatProject,
  type ChatWorkspaceSnapshot,
  validateChatAttachmentCandidate,
} from "@/packages/contracts/src";
import {
  createManualChatCheckpoint,
  createPersistentChatAttachmentRecord,
  createPersistentChatProject,
  createPersistentUserChatMessage,
  createPersistentAssistantChatMessage,
  deletePersistentChatConversation,
  deletePersistentChatProject,
  deletePersistentPendingChatAttachment,
  getPersistentChatAttachmentRecord,
  getPersistentChatProjectActivity,
  getPersistentChatWorkspaceSnapshot,
  isDatabaseConfigured,
  renamePersistentChatConversation,
  renamePersistentChatProject,
  restorePersistentChatCheckpoint,
} from "@/packages/persistence/src";
import {
  localChatAttachmentStorage,
  readChatDatabase,
  withChatStorageLock,
  writeChatDatabase,
} from "./storage";
import type {
  ChatAttachmentRecord,
  ChatConversationRecord,
  ChatDatabase,
  ChatMessageRecord,
  ChatProjectRecord,
} from "./schema";

function isPersistentChatEnabled() {
  return isDatabaseConfigured();
}

const seededProjectLabels = ["Verified profile", "Career story", "Hiring signals"] as const;

declare global {
  // eslint-disable-next-line no-var
  var __careerAiChatUploadRateLimit: Map<string, { count: number; resetAt: number }> | undefined;
}

function createEntityId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
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

function buildAttachmentSummary(attachments: ChatAttachmentRecord[]) {
  if (attachments.length === 0) {
    return "";
  }

  if (attachments.length === 1) {
    return `Attachment: ${attachments[0].originalName}`;
  }

  return `Attachments: ${attachments[0].originalName} +${attachments.length - 1} more`;
}

function buildConversationLabel(args: {
  attachments: ChatAttachmentRecord[];
  message: string;
}) {
  const normalizedMessage = normalizeLabel(args.message);

  if (normalizedMessage) {
    return truncateLabel(normalizedMessage, 80);
  }

  return truncateLabel(buildAttachmentSummary(args.attachments) || "New chat", 80);
}

function getOwnerUploadRateLimitStore() {
  if (!globalThis.__careerAiChatUploadRateLimit) {
    globalThis.__careerAiChatUploadRateLimit = new Map();
  }

  return globalThis.__careerAiChatUploadRateLimit;
}

function assertChatUploadRateLimit(ownerId: string, now = Date.now()) {
  const store = getOwnerUploadRateLimitStore();
  const currentWindow = store.get(ownerId);

  if (!currentWindow || currentWindow.resetAt <= now) {
    store.set(ownerId, {
      count: 1,
      resetAt: now + chatAttachmentLimits.uploadWindowMs,
    });
    return;
  }

  if (currentWindow.count >= chatAttachmentLimits.maxUploadsPerWindow) {
    throw new ApiError({
      correlationId: `chat_rate_${ownerId}`,
      details: {
        limit: chatAttachmentLimits.maxUploadsPerWindow,
        windowMs: chatAttachmentLimits.uploadWindowMs,
      },
      errorCode: "RATE_LIMITED",
      message: "Upload limit reached. Wait a few minutes before adding more files.",
      status: 429,
    });
  }

  currentWindow.count += 1;
  store.set(ownerId, currentWindow);
}

function sortProjects(projects: ChatProjectRecord[]) {
  return [...projects].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function sortConversations(conversations: ChatConversationRecord[]) {
  return [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function sortMessages(messages: ChatMessageRecord[]) {
  return [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function buildProjectLabel(projects: ChatProjectRecord[]) {
  let projectIndex = 1;

  while (true) {
    const nextLabel = projectIndex === 1 ? "New project" : `New project ${projectIndex}`;

    if (!projects.some((project) => project.label === nextLabel)) {
      return nextLabel;
    }

    projectIndex += 1;
  }
}

async function readFileBuffer(file: File) {
  const arrayBufferReader = (
    file as File & {
      arrayBuffer?: () => Promise<ArrayBuffer>;
    }
  ).arrayBuffer;

  if (typeof arrayBufferReader === "function") {
    return Buffer.from(await arrayBufferReader.call(file));
  }

  const streamReader = (
    file as File & {
      stream?: () => ReadableStream<Uint8Array>;
    }
  ).stream;

  if (typeof streamReader === "function") {
    const reader = streamReader.call(file).getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      if (result.value) {
        chunks.push(result.value);
      }
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }

  if (typeof FileReader !== "undefined") {
    return new Promise<Buffer>((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(reader.error ?? new Error("Unable to read uploaded file."));
      };
      reader.onload = () => {
        const result = reader.result;

        if (!(result instanceof ArrayBuffer)) {
          reject(new Error("Unable to read uploaded file."));
          return;
        }

        resolve(Buffer.from(result));
      };

      reader.readAsArrayBuffer(file);
    });
  }

  return Buffer.from(await new Response(file).arrayBuffer());
}

function mapAttachmentToDto(record: ChatAttachmentRecord): ChatAttachment {
  const openUrl = `/api/chat/attachments/${record.id}`;

  return {
    createdAt: record.createdAt,
    downloadUrl: `${openUrl}?download=1`,
    extension: record.extension,
    id: record.id,
    messageId: record.messageId,
    mimeType: record.mimeType,
    openUrl,
    originalName: record.originalName,
    previewKind: record.previewKind,
    sizeBytes: record.sizeBytes,
    status: record.status,
    thumbnailUrl: record.previewKind === "image" ? openUrl : null,
    updatedAt: record.updatedAt,
  };
}

function mapMessageToDto(args: {
  attachments: ChatAttachmentRecord[];
  record: ChatMessageRecord;
}): ChatMessage {
  return {
    attachments: args.attachments.map(mapAttachmentToDto),
    content: args.record.content,
    createdAt: args.record.createdAt,
    error: args.record.error,
    id: args.record.id,
    role: args.record.role,
  };
}

function mapConversationToDto(args: {
  attachments: ChatAttachmentRecord[];
  messages: ChatMessageRecord[];
  record: ChatConversationRecord;
}): ChatConversation {
  return {
    createdAt: args.record.createdAt,
    id: args.record.id,
    label: args.record.label,
    labelSource: args.record.labelSource,
    messages: args.messages.map((message) =>
      mapMessageToDto({
        attachments: args.attachments.filter((attachment) => attachment.messageId === message.id),
        record: message,
      }),
    ),
    projectId: args.record.projectId,
    updatedAt: args.record.updatedAt,
  };
}

function mapProjectToDto(record: ChatProjectRecord): ChatProject {
  return {
    createdAt: record.createdAt,
    id: record.id,
    label: record.label,
    updatedAt: record.updatedAt,
  };
}

async function removeAttachmentRecords(args: {
  attachments: ChatAttachmentRecord[];
  baseDir?: string;
}) {
  await Promise.all(
    args.attachments.map((attachment) =>
      localChatAttachmentStorage.delete(attachment.storageKey, args.baseDir),
    ),
  );
}

async function cleanupExpiredPendingAttachments(args: {
  baseDir?: string;
  database: ChatDatabase;
}) {
  const now = Date.now();
  const expiredAttachments = args.database.attachments.filter(
    (attachment) =>
      attachment.messageId === null &&
      now - Date.parse(attachment.updatedAt) > chatAttachmentLimits.pendingAttachmentRetentionMs,
  );

  if (expiredAttachments.length === 0) {
    return {
      changed: false,
      database: args.database,
    };
  }

  await removeAttachmentRecords({
    attachments: expiredAttachments,
    baseDir: args.baseDir,
  });

  return {
    changed: true,
    database: {
      ...args.database,
      attachments: args.database.attachments.filter(
        (attachment) => !expiredAttachments.some((expired) => expired.id === attachment.id),
      ),
    },
  };
}

function ensureOwnerWorkspace(args: {
  database: ChatDatabase;
  ownerId: string;
}) {
  const ownerProjects = args.database.projects.filter((project) => project.ownerId === args.ownerId);

  if (ownerProjects.length > 0) {
    return args.database;
  }

  const seedTime = new Date().toISOString();

  return {
    ...args.database,
    projects: [
      ...args.database.projects,
      ...seededProjectLabels.map((label, index) => ({
        createdAt: new Date(Date.parse(seedTime) + index).toISOString(),
        id: createEntityId("project"),
        label,
        ownerId: args.ownerId,
        updatedAt: new Date(Date.parse(seedTime) + index).toISOString(),
      })),
    ],
  };
}

async function prepareDatabase(args: {
  baseDir?: string;
  ownerId: string;
}) {
  let database = await readChatDatabase(args.baseDir);
  const cleanedResult = await cleanupExpiredPendingAttachments({
    baseDir: args.baseDir,
    database,
  });
  let changed = cleanedResult.changed;
  database = ensureOwnerWorkspace({
    database: cleanedResult.database,
    ownerId: args.ownerId,
  });

  if (database !== cleanedResult.database) {
    changed = true;
  }

  if (changed) {
    await writeChatDatabase(database, args.baseDir);
  }

  return database;
}

function findOwnerProject(database: ChatDatabase, ownerId: string, projectId: string) {
  return database.projects.find((project) => project.ownerId === ownerId && project.id === projectId);
}

function findOwnerConversation(database: ChatDatabase, ownerId: string, conversationId: string) {
  return database.conversations.find(
    (conversation) => conversation.ownerId === ownerId && conversation.id === conversationId,
  );
}

function findOwnerAttachment(database: ChatDatabase, ownerId: string, attachmentId: string) {
  return database.attachments.find(
    (attachment) => attachment.ownerId === ownerId && attachment.id === attachmentId,
  );
}

function requireProject(database: ChatDatabase, ownerId: string, projectId: string) {
  const project = findOwnerProject(database, ownerId, projectId);

  if (!project) {
    throw new ApiError({
      correlationId: `chat_project_${projectId}`,
      details: { projectId },
      errorCode: "NOT_FOUND",
      message: "Project was not found.",
      status: 404,
    });
  }

  return project;
}

function requireConversation(database: ChatDatabase, ownerId: string, conversationId: string) {
  const conversation = findOwnerConversation(database, ownerId, conversationId);

  if (!conversation) {
    throw new ApiError({
      correlationId: `chat_conversation_${conversationId}`,
      details: { conversationId },
      errorCode: "NOT_FOUND",
      message: "Conversation was not found.",
      status: 404,
    });
  }

  return conversation;
}

function requirePendingAttachments(args: {
  attachmentIds: string[];
  database: ChatDatabase;
  ownerId: string;
}) {
  const attachments = args.attachmentIds.map((attachmentId) => {
    const attachment = findOwnerAttachment(args.database, args.ownerId, attachmentId);

    if (!attachment) {
      throw new ApiError({
        correlationId: `chat_attachment_${attachmentId}`,
        details: { attachmentId },
        errorCode: "NOT_FOUND",
        message: "Attachment was not found.",
        status: 404,
      });
    }

    if (attachment.messageId) {
      throw new ApiError({
        correlationId: `chat_attachment_${attachmentId}`,
        details: { attachmentId },
        errorCode: "CONFLICT",
        message: "Attachment has already been sent.",
        status: 409,
      });
    }

    return attachment;
  });

  const distinctIds = new Set(attachments.map((attachment) => attachment.id));

  if (distinctIds.size !== attachments.length) {
    throw new ApiError({
      correlationId: `chat_attachment_duplicate_${args.ownerId}`,
      details: { attachmentIds: args.attachmentIds },
      errorCode: "VALIDATION_FAILED",
      message: "Remove duplicate attachments before sending.",
      status: 400,
    });
  }

  return attachments;
}

function buildWorkspaceSnapshot(args: {
  database: ChatDatabase;
  ownerId: string;
}) {
  const projects = sortProjects(args.database.projects.filter((project) => project.ownerId === args.ownerId));
  const conversations = sortConversations(
    args.database.conversations.filter((conversation) => conversation.ownerId === args.ownerId),
  );
  const messages = sortMessages(args.database.messages.filter((message) => message.ownerId === args.ownerId));
  const attachments = args.database.attachments.filter((attachment) => attachment.ownerId === args.ownerId);

  return chatWorkspaceSnapshotSchema.parse({
    conversations: conversations.map((conversation) =>
      mapConversationToDto({
        attachments,
        messages: messages.filter((message) => message.conversationId === conversation.id),
        record: conversation,
      }),
    ),
    persistence: emptyChatWorkspacePersistence,
    projectPersistence: Object.fromEntries(
      projects.map((project) => [
        project.id,
        {
          checkpointCount: 0,
          lastActivityAt: project.updatedAt,
          lastCheckpointAt: null,
          lastSavedAt: project.updatedAt,
          pendingMemoryJobs: 0,
          projectId: project.id,
        },
      ]),
    ),
    projects: projects.map(mapProjectToDto),
  });
}

function buildConversationSnapshot(args: {
  conversationId: string;
  database: ChatDatabase;
  ownerId: string;
}) {
  const snapshot = buildWorkspaceSnapshot({
    database: args.database,
    ownerId: args.ownerId,
  });
  const conversation = snapshot.conversations.find(
    (candidate) => candidate.id === args.conversationId,
  );

  if (!conversation) {
    throw new ApiError({
      correlationId: `chat_conversation_${args.conversationId}`,
      details: { conversationId: args.conversationId },
      errorCode: "NOT_FOUND",
      message: "Conversation was not found.",
      status: 404,
    });
  }

  return conversation;
}

export async function getChatWorkspaceSnapshot(args: {
  baseDir?: string;
  ownerId: string;
}): Promise<ChatWorkspaceSnapshot> {
  if (isPersistentChatEnabled()) {
    return getPersistentChatWorkspaceSnapshot({
      ownerId: args.ownerId,
    });
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);

    return buildWorkspaceSnapshot({
      database,
      ownerId: args.ownerId,
    });
  });
}

export async function createChatProject(args: {
  baseDir?: string;
  label?: string;
  ownerId: string;
}) {
  if (isPersistentChatEnabled()) {
    return createPersistentChatProject({
      label: args.label,
      ownerId: args.ownerId,
    });
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    const ownerProjects = database.projects.filter((project) => project.ownerId === args.ownerId);
    const normalizedLabel = args.label ? normalizeLabel(args.label) : "";
    const createdAt = new Date().toISOString();

    database.projects.push({
      createdAt,
      id: createEntityId("project"),
      label: normalizedLabel || buildProjectLabel(ownerProjects),
      ownerId: args.ownerId,
      updatedAt: createdAt,
    });

    await writeChatDatabase(database, args.baseDir);

    return buildWorkspaceSnapshot({
      database,
      ownerId: args.ownerId,
    });
  });
}

export async function renameChatProject(args: {
  baseDir?: string;
  label: string;
  ownerId: string;
  projectId: string;
}) {
  if (isPersistentChatEnabled()) {
    return renamePersistentChatProject({
      label: args.label,
      ownerId: args.ownerId,
      projectId: args.projectId,
    });
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    const project = requireProject(database, args.ownerId, args.projectId);
    const normalizedLabel = normalizeLabel(args.label);

    project.label = normalizedLabel;
    project.updatedAt = new Date().toISOString();

    await writeChatDatabase(database, args.baseDir);

    return buildWorkspaceSnapshot({
      database,
      ownerId: args.ownerId,
    });
  });
}

export async function deleteChatProject(args: {
  baseDir?: string;
  ownerId: string;
  projectId: string;
}) {
  if (isPersistentChatEnabled()) {
    return deletePersistentChatProject({
      ownerId: args.ownerId,
      projectId: args.projectId,
    });
  }

  return withChatStorageLock(async () => {
    let database = await prepareDatabase(args);
    requireProject(database, args.ownerId, args.projectId);

    const conversationIds = new Set(
      database.conversations
        .filter((conversation) => conversation.ownerId === args.ownerId && conversation.projectId === args.projectId)
        .map((conversation) => conversation.id),
    );
    const attachmentsToDelete = database.attachments.filter(
      (attachment) =>
        attachment.ownerId === args.ownerId &&
        attachment.conversationId !== null &&
        conversationIds.has(attachment.conversationId),
    );

    await removeAttachmentRecords({
      attachments: attachmentsToDelete,
      baseDir: args.baseDir,
    });

    database = {
      ...database,
      attachments: database.attachments.filter(
        (attachment) => !attachmentsToDelete.some((candidate) => candidate.id === attachment.id),
      ),
      conversations: database.conversations.filter(
        (conversation) => !(conversation.ownerId === args.ownerId && conversation.projectId === args.projectId),
      ),
      messages: database.messages.filter(
        (message) => !(message.ownerId === args.ownerId && conversationIds.has(message.conversationId)),
      ),
      projects: database.projects.filter(
        (project) => !(project.ownerId === args.ownerId && project.id === args.projectId),
      ),
    };

    if (database.projects.every((project) => project.ownerId !== args.ownerId)) {
      const now = new Date().toISOString();
      database.projects.push({
        createdAt: now,
        id: createEntityId("project"),
        label: "New project",
        ownerId: args.ownerId,
        updatedAt: now,
      });
    }

    await writeChatDatabase(database, args.baseDir);

    return buildWorkspaceSnapshot({
      database,
      ownerId: args.ownerId,
    });
  });
}

export async function renameChatConversation(args: {
  baseDir?: string;
  conversationId: string;
  label: string;
  ownerId: string;
}) {
  if (isPersistentChatEnabled()) {
    return renamePersistentChatConversation({
      conversationId: args.conversationId,
      label: args.label,
      ownerId: args.ownerId,
    });
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    const conversation = requireConversation(database, args.ownerId, args.conversationId);

    conversation.label = normalizeLabel(args.label);
    conversation.labelSource = "manual";
    conversation.updatedAt = new Date().toISOString();

    await writeChatDatabase(database, args.baseDir);

    return buildWorkspaceSnapshot({
      database,
      ownerId: args.ownerId,
    });
  });
}

export async function deleteChatConversation(args: {
  baseDir?: string;
  conversationId: string;
  ownerId: string;
}) {
  if (isPersistentChatEnabled()) {
    return deletePersistentChatConversation({
      conversationId: args.conversationId,
      ownerId: args.ownerId,
    });
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    requireConversation(database, args.ownerId, args.conversationId);

    const attachmentsToDelete = database.attachments.filter(
      (attachment) =>
        attachment.ownerId === args.ownerId && attachment.conversationId === args.conversationId,
    );

    await removeAttachmentRecords({
      attachments: attachmentsToDelete,
      baseDir: args.baseDir,
    });

    const nextDatabase: ChatDatabase = {
      ...database,
      attachments: database.attachments.filter(
        (attachment) => !attachmentsToDelete.some((candidate) => candidate.id === attachment.id),
      ),
      conversations: database.conversations.filter(
        (conversation) =>
          !(conversation.ownerId === args.ownerId && conversation.id === args.conversationId),
      ),
      messages: database.messages.filter(
        (message) =>
          !(message.ownerId === args.ownerId && message.conversationId === args.conversationId),
      ),
      projects: database.projects,
    };

    await writeChatDatabase(nextDatabase, args.baseDir);

    return buildWorkspaceSnapshot({
      database: nextDatabase,
      ownerId: args.ownerId,
    });
  });
}

export async function createChatAttachment(args: {
  baseDir?: string;
  file: File;
  ownerId: string;
}) {
  assertChatUploadRateLimit(args.ownerId);

  const validation = validateChatAttachmentCandidate({
    mimeType: args.file.type,
    name: args.file.name,
    sizeBytes: args.file.size,
  });

  if (!validation.ok) {
    throw new ApiError({
      correlationId: `chat_upload_${args.ownerId}`,
      details: {
        fileName: args.file.name,
        sizeBytes: args.file.size,
      },
      errorCode: "VALIDATION_FAILED",
      message: validation.message,
      status: 400,
    });
  }

  const buffer = await readFileBuffer(args.file);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const storageKey = `${checksum.slice(0, 12)}/${createEntityId("attachment")}.${validation.descriptor.extension}`;

  await localChatAttachmentStorage.write({
    baseDir: args.baseDir,
    buffer,
    storageKey,
  });

  if (isPersistentChatEnabled()) {
    const { attachment } = await createPersistentChatAttachmentRecord({
      extension: validation.descriptor.extension,
      mimeType: validation.descriptor.normalizedMimeType,
      originalName: validation.sanitizedName,
      ownerId: args.ownerId,
      previewKind: validation.descriptor.previewKind,
      sizeBytes: buffer.byteLength,
      storageKey,
    });

    return attachment;
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    const timestamp = new Date().toISOString();
    const record: ChatAttachmentRecord = {
      conversationId: null,
      createdAt: timestamp,
      extension: validation.descriptor.extension,
      id: createEntityId("attachment"),
      messageId: null,
      mimeType: validation.descriptor.normalizedMimeType,
      originalName: validation.sanitizedName,
      ownerId: args.ownerId,
      previewKind: validation.descriptor.previewKind,
      scanStatus: "pending",
      sizeBytes: buffer.byteLength,
      status: "uploaded",
      storageKey,
      updatedAt: timestamp,
    };

    database.attachments.push(record);
    await writeChatDatabase(database, args.baseDir);

    return mapAttachmentToDto(record);
  });
}

export async function deletePendingChatAttachment(args: {
  attachmentId: string;
  baseDir?: string;
  ownerId: string;
}) {
  if (isPersistentChatEnabled()) {
    const storageKey = await deletePersistentPendingChatAttachment({
      attachmentId: args.attachmentId,
      ownerId: args.ownerId,
    });

    await localChatAttachmentStorage.delete(storageKey, args.baseDir);
    return;
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    const attachment = findOwnerAttachment(database, args.ownerId, args.attachmentId);

    if (!attachment) {
      return;
    }

    if (attachment.messageId) {
      throw new ApiError({
        correlationId: `chat_attachment_${args.attachmentId}`,
        details: { attachmentId: args.attachmentId },
        errorCode: "CONFLICT",
        message: "Sent attachments cannot be deleted from the composer.",
        status: 409,
      });
    }

    await localChatAttachmentStorage.delete(attachment.storageKey, args.baseDir);

    const nextDatabase: ChatDatabase = {
      ...database,
      attachments: database.attachments.filter(
        (candidate) => candidate.id !== args.attachmentId,
      ),
    };

    await writeChatDatabase(nextDatabase, args.baseDir);
  });
}

export async function createUserChatMessage(args: {
  attachmentIds: string[];
  baseDir?: string;
  clientRequestId?: string;
  conversationId?: string | null;
  message: string;
  ownerId: string;
  projectId: string;
}) {
  if (isPersistentChatEnabled()) {
    return createPersistentUserChatMessage({
      attachmentIds: args.attachmentIds,
      clientRequestId: args.clientRequestId,
      conversationId: args.conversationId,
      message: args.message,
      ownerId: args.ownerId,
      projectId: args.projectId,
    });
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    requireProject(database, args.ownerId, args.projectId);

    const pendingAttachments = requirePendingAttachments({
      attachmentIds: args.attachmentIds,
      database,
      ownerId: args.ownerId,
    });
    const timestamp = new Date().toISOString();
    const conversation =
      args.conversationId && findOwnerConversation(database, args.ownerId, args.conversationId)
        ? requireConversation(database, args.ownerId, args.conversationId)
        : ({
            createdAt: timestamp,
            id: createEntityId("conversation"),
            label: buildConversationLabel({
              attachments: pendingAttachments,
              message: args.message,
            }),
            labelSource: "auto",
            ownerId: args.ownerId,
            projectId: args.projectId,
            updatedAt: timestamp,
          } satisfies ChatConversationRecord);

    if (conversation.projectId !== args.projectId) {
      throw new ApiError({
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

    if (!findOwnerConversation(database, args.ownerId, conversation.id)) {
      database.conversations.push(conversation);
    }

    const messageRecord: ChatMessageRecord = {
      content: args.message,
      conversationId: conversation.id,
      createdAt: timestamp,
      id: createEntityId("message"),
      ownerId: args.ownerId,
      role: "user",
    };

    database.messages.push(messageRecord);

    for (const attachment of pendingAttachments) {
      attachment.conversationId = conversation.id;
      attachment.messageId = messageRecord.id;
      attachment.scanStatus = "not_scanned";
      attachment.status = "attached";
      attachment.updatedAt = timestamp;
    }

    conversation.updatedAt = timestamp;

    await writeChatDatabase(database, args.baseDir);

    return {
      assistantMessage: null,
      conversation: buildConversationSnapshot({
        conversationId: conversation.id,
        database,
        ownerId: args.ownerId,
      }),
      userMessage: buildConversationSnapshot({
        conversationId: conversation.id,
        database,
        ownerId: args.ownerId,
      }).messages.find((message) => message.id === messageRecord.id)!,
      workspace: buildWorkspaceSnapshot({
        database,
        ownerId: args.ownerId,
      }),
    };
  });
}

export async function createAssistantChatMessage(args: {
  baseDir?: string;
  content: string;
  conversationId: string;
  error?: boolean;
  ownerId: string;
  replyToMessageId?: string | null;
}) {
  if (isPersistentChatEnabled()) {
    return createPersistentAssistantChatMessage({
      content: args.content,
      conversationId: args.conversationId,
      error: args.error,
      ownerId: args.ownerId,
      replyToMessageId: args.replyToMessageId,
    });
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    const conversation = requireConversation(database, args.ownerId, args.conversationId);
    const timestamp = new Date().toISOString();
    const messageRecord: ChatMessageRecord = {
      content: args.content,
      conversationId: conversation.id,
      createdAt: timestamp,
      error: args.error,
      id: createEntityId("message"),
      ownerId: args.ownerId,
      role: "assistant",
    };

    database.messages.push(messageRecord);
    conversation.updatedAt = timestamp;

    await writeChatDatabase(database, args.baseDir);

    return {
      assistantMessage: buildConversationSnapshot({
        conversationId: conversation.id,
        database,
        ownerId: args.ownerId,
      }).messages.find((message) => message.id === messageRecord.id)!,
      conversation: buildConversationSnapshot({
        conversationId: conversation.id,
        database,
        ownerId: args.ownerId,
      }),
      workspace: buildWorkspaceSnapshot({
        database,
        ownerId: args.ownerId,
      }),
    };
  });
}

export async function getChatAttachmentContent(args: {
  attachmentId: string;
  baseDir?: string;
  ownerId: string;
}) {
  if (isPersistentChatEnabled()) {
    const { attachment, storageKey } = await getPersistentChatAttachmentRecord({
      attachmentId: args.attachmentId,
      ownerId: args.ownerId,
    });
    const buffer = await localChatAttachmentStorage.read(storageKey, args.baseDir);

    return {
      attachment,
      buffer,
    };
  }

  return withChatStorageLock(async () => {
    const database = await prepareDatabase(args);
    const attachment = findOwnerAttachment(database, args.ownerId, args.attachmentId);

    if (!attachment) {
      throw new ApiError({
        correlationId: `chat_attachment_${args.attachmentId}`,
        details: { attachmentId: args.attachmentId },
        errorCode: "NOT_FOUND",
        message: "Attachment was not found.",
        status: 404,
      });
    }

    const buffer = await localChatAttachmentStorage.read(attachment.storageKey, args.baseDir);

    return {
      attachment: mapAttachmentToDto(attachment),
      buffer,
    };
  });
}

export async function createChatCheckpoint(args: {
  conversationId?: string | null;
  ownerId: string;
  projectId: string;
  title?: string;
}) {
  if (!isPersistentChatEnabled()) {
    throw new ApiError({
      correlationId: `chat_checkpoint_${args.projectId}`,
      details: {
        projectId: args.projectId,
      },
      errorCode: "DEPENDENCY_FAILURE",
      message: "Checkpointing requires a configured database.",
      status: 501,
    });
  }

  return createManualChatCheckpoint(args);
}

export async function getChatProjectActivity(args: {
  ownerId: string;
  projectId: string;
}) {
  if (!isPersistentChatEnabled()) {
    throw new ApiError({
      correlationId: `chat_activity_${args.projectId}`,
      details: {
        projectId: args.projectId,
      },
      errorCode: "DEPENDENCY_FAILURE",
      message: "Activity history requires a configured database.",
      status: 501,
    });
  }

  return getPersistentChatProjectActivity(args);
}

export async function restoreChatCheckpoint(args: {
  checkpointId: string;
  ownerId: string;
}) {
  if (!isPersistentChatEnabled()) {
    throw new ApiError({
      correlationId: `chat_restore_${args.checkpointId}`,
      details: {
        checkpointId: args.checkpointId,
      },
      errorCode: "DEPENDENCY_FAILURE",
      message: "Checkpoint restore requires a configured database.",
      status: 501,
    });
  }

  return restorePersistentChatCheckpoint(args);
}

export function summarizeChatAttachmentsForAssistant(attachments: ChatAttachment[]) {
  return attachments.map((attachment) => ({
    mimeType: attachment.mimeType,
    name: attachment.originalName,
    size: attachment.sizeBytes,
  }));
}

export function getChatAttachmentValidationSummary() {
  return {
    maxFileSize: formatChatAttachmentSize(chatAttachmentLimits.maxFileSizeBytes),
    maxFilesPerMessage: chatAttachmentLimits.maxFilesPerMessage,
  };
}
