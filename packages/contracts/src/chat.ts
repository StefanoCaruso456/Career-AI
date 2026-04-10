import { z } from "zod";

export const chatAttachmentPreviewKindSchema = z.enum([
  "document",
  "image",
  "pdf",
  "presentation",
  "spreadsheet",
  "text",
]);

export const chatAttachmentStatusSchema = z.enum(["attached", "uploaded"]);
export const chatConversationLabelSourceSchema = z.enum(["auto", "manual"]);
export const chatMessageRoleSchema = z.enum(["assistant", "user"]);
export const chatMemoryScopeSchema = z.enum(["user", "project", "thread"]);
export const chatMemoryTypeSchema = z.enum([
  "preference",
  "fact",
  "goal",
  "constraint",
  "summary",
  "task",
]);
export const chatMemoryVerificationStatusSchema = z.enum(["unverified", "verified"]);
export const chatCheckpointTypeSchema = z.enum([
  "auto",
  "manual",
  "milestone",
  "pre_tool",
  "post_tool",
]);

export const chatAttachmentLimits = {
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxFilesPerMessage: 8,
  maxFilenameLength: 180,
  maxMessageLength: 4000,
  maxUploadsPerWindow: 24,
  pendingAttachmentRetentionMs: 24 * 60 * 60 * 1000,
  uploadWindowMs: 5 * 60 * 1000,
} as const;

export const supportedChatAttachmentTypes = [
  {
    extension: "pdf",
    label: "PDF",
    mimeTypes: ["application/pdf"],
    previewKind: "pdf",
  },
  {
    extension: "csv",
    label: "CSV",
    mimeTypes: ["text/csv", "application/csv", "application/vnd.ms-excel"],
    previewKind: "spreadsheet",
  },
  {
    extension: "txt",
    label: "Text",
    mimeTypes: ["text/plain"],
    previewKind: "text",
  },
  {
    extension: "md",
    label: "Markdown",
    mimeTypes: ["text/markdown", "text/x-markdown"],
    previewKind: "text",
  },
  {
    extension: "json",
    label: "JSON",
    mimeTypes: ["application/json", "text/json"],
    previewKind: "text",
  },
  {
    extension: "doc",
    label: "Word",
    mimeTypes: ["application/msword"],
    previewKind: "document",
  },
  {
    extension: "docx",
    label: "Word",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    previewKind: "document",
  },
  {
    extension: "xls",
    label: "Excel",
    mimeTypes: ["application/vnd.ms-excel"],
    previewKind: "spreadsheet",
  },
  {
    extension: "xlsx",
    label: "Excel",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    previewKind: "spreadsheet",
  },
  {
    extension: "ppt",
    label: "PowerPoint",
    mimeTypes: ["application/vnd.ms-powerpoint"],
    previewKind: "presentation",
  },
  {
    extension: "pptx",
    label: "PowerPoint",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    previewKind: "presentation",
  },
  {
    extension: "png",
    label: "PNG",
    mimeTypes: ["image/png"],
    previewKind: "image",
  },
  {
    extension: "jpg",
    label: "JPG",
    mimeTypes: ["image/jpeg"],
    previewKind: "image",
  },
  {
    extension: "jpeg",
    label: "JPEG",
    mimeTypes: ["image/jpeg"],
    previewKind: "image",
  },
  {
    extension: "webp",
    label: "WEBP",
    mimeTypes: ["image/webp"],
    previewKind: "image",
  },
] as const;

export type SupportedChatAttachmentType = (typeof supportedChatAttachmentTypes)[number];
export type ChatAttachmentPreviewKind = z.infer<typeof chatAttachmentPreviewKindSchema>;
export type ChatAttachmentStatus = z.infer<typeof chatAttachmentStatusSchema>;
export type ChatConversationLabelSource = z.infer<typeof chatConversationLabelSourceSchema>;
export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;
export type ChatMemoryScope = z.infer<typeof chatMemoryScopeSchema>;
export type ChatMemoryType = z.infer<typeof chatMemoryTypeSchema>;
export type ChatMemoryVerificationStatus = z.infer<
  typeof chatMemoryVerificationStatusSchema
>;
export type ChatCheckpointType = z.infer<typeof chatCheckpointTypeSchema>;

const chatAttachmentTypeByExtension = new Map<string, SupportedChatAttachmentType>(
  supportedChatAttachmentTypes.map((type) => [type.extension, type] satisfies [string, SupportedChatAttachmentType]),
);

const chatAttachmentTypeByMime = new Map<string, SupportedChatAttachmentType>();

for (const type of supportedChatAttachmentTypes) {
  for (const mimeType of type.mimeTypes) {
    chatAttachmentTypeByMime.set(mimeType, type);
  }
}

export const createChatProjectInputSchema = z.object({
  label: z.string().trim().max(80).optional(),
});

export const renameChatProjectInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
});

export const renameChatConversationInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
});

export const sendChatMessageInputSchema = z
  .object({
    attachmentIds: z.array(z.string().trim().min(1)).max(chatAttachmentLimits.maxFilesPerMessage).default([]),
    clientRequestId: z.string().trim().min(1).max(120).optional(),
    conversationId: z.string().trim().min(1).nullable().optional(),
    message: z.string().trim().max(chatAttachmentLimits.maxMessageLength).default(""),
    projectId: z.string().trim().min(1),
  })
  .superRefine((payload, context) => {
    if (!payload.message.trim() && payload.attachmentIds.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a message or attach a file before sending.",
        path: ["message"],
      });
    }
  });

export const chatAttachmentSchema = z.object({
  createdAt: z.string().datetime(),
  downloadUrl: z.string().trim().min(1),
  extension: z.string().trim().min(1).max(16),
  id: z.string().trim().min(1),
  messageId: z.string().trim().min(1).nullable(),
  mimeType: z.string().trim().min(1).max(200),
  openUrl: z.string().trim().min(1),
  originalName: z.string().trim().min(1).max(chatAttachmentLimits.maxFilenameLength),
  previewKind: chatAttachmentPreviewKindSchema,
  sizeBytes: z.number().int().nonnegative().max(chatAttachmentLimits.maxFileSizeBytes),
  status: chatAttachmentStatusSchema,
  thumbnailUrl: z.string().trim().min(1).nullable(),
  updatedAt: z.string().datetime(),
});

export const chatMessageSchema = z.object({
  attachments: z.array(chatAttachmentSchema),
  content: z.string(),
  createdAt: z.string().datetime(),
  error: z.boolean().optional(),
  id: z.string().trim().min(1),
  role: chatMessageRoleSchema,
});

export const chatConversationSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
  labelSource: chatConversationLabelSourceSchema,
  messages: z.array(chatMessageSchema),
  projectId: z.string().trim().min(1),
  updatedAt: z.string().datetime(),
});

export const chatProjectSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
  updatedAt: z.string().datetime(),
});

export const emptyChatWorkspacePersistence = {
  checkpointCount: 0,
  lastCheckpointAt: null,
  lastSavedAt: null,
  pendingMemoryJobs: 0,
} as const;

export const chatWorkspacePersistenceSchema = z.object({
  checkpointCount: z.number().int().nonnegative(),
  lastCheckpointAt: z.string().datetime().nullable(),
  lastSavedAt: z.string().datetime().nullable(),
  pendingMemoryJobs: z.number().int().nonnegative(),
});

export const chatProjectPersistenceSchema = z.object({
  checkpointCount: z.number().int().nonnegative(),
  lastActivityAt: z.string().datetime().nullable(),
  lastCheckpointAt: z.string().datetime().nullable(),
  lastSavedAt: z.string().datetime().nullable(),
  pendingMemoryJobs: z.number().int().nonnegative(),
  projectId: z.string().trim().min(1),
});

export const chatMemoryRecordSchema = z.object({
  confidence: z.number().min(0).max(1),
  content: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  id: z.string().trim().min(1),
  memoryType: chatMemoryTypeSchema,
  scope: chatMemoryScopeSchema,
  scopeId: z.string().trim().min(1),
  sourceMessageIds: z.array(z.string().trim().min(1)),
  title: z.string().trim().min(1).max(120),
  updatedAt: z.string().datetime(),
  verificationStatus: chatMemoryVerificationStatusSchema,
});

export const chatCheckpointSchema = z.object({
  checkpointType: chatCheckpointTypeSchema,
  conversationId: z.string().trim().min(1).nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string().trim().min(1),
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  restoredAt: z.string().datetime().nullable(),
  summary: z.string().trim().min(1),
  title: z.string().trim().min(1).max(120),
});

export const chatAuditActivityEventSchema = z.object({
  actorId: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  entityId: z.string().trim().min(1),
  entityType: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  id: z.string().trim().min(1),
  payloadJson: z.record(z.string(), z.unknown()),
  summary: z.string().trim().min(1),
});

export const chatProjectActivitySnapshotSchema = z.object({
  checkpoints: z.array(chatCheckpointSchema),
  events: z.array(chatAuditActivityEventSchema),
  memoryRecords: z.array(chatMemoryRecordSchema),
  project: chatProjectSchema,
});

export const chatWorkspaceSnapshotSchema = z.object({
  conversations: z.array(chatConversationSchema),
  persistence: chatWorkspacePersistenceSchema.default(emptyChatWorkspacePersistence),
  projectPersistence: z.record(z.string(), chatProjectPersistenceSchema).default({}),
  projects: z.array(chatProjectSchema),
});

export type ChatProject = z.infer<typeof chatProjectSchema>;
export type ChatConversation = z.infer<typeof chatConversationSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;
export type ChatWorkspacePersistence = z.infer<typeof chatWorkspacePersistenceSchema>;
export type ChatProjectPersistence = z.infer<typeof chatProjectPersistenceSchema>;
export type ChatMemoryRecord = z.infer<typeof chatMemoryRecordSchema>;
export type ChatCheckpoint = z.infer<typeof chatCheckpointSchema>;
export type ChatAuditActivityEvent = z.infer<typeof chatAuditActivityEventSchema>;
export type ChatProjectActivitySnapshot = z.infer<
  typeof chatProjectActivitySnapshotSchema
>;
export type ChatWorkspaceSnapshot = z.infer<typeof chatWorkspaceSnapshotSchema>;
export type CreateChatProjectInput = z.infer<typeof createChatProjectInputSchema>;
export type RenameChatProjectInput = z.infer<typeof renameChatProjectInputSchema>;
export type RenameChatConversationInput = z.infer<typeof renameChatConversationInputSchema>;
export type SendChatMessageInput = z.infer<typeof sendChatMessageInputSchema>;

export type ChatAttachmentDescriptor = {
  acceptedMimeTypes: readonly string[];
  extension: string;
  label: string;
  normalizedMimeType: string;
  previewKind: ChatAttachmentPreviewKind;
};

export type ChatAttachmentValidationResult =
  | {
      descriptor: ChatAttachmentDescriptor;
      ok: true;
      sanitizedName: string;
    }
  | {
      message: string;
      ok: false;
    };

export function formatChatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(sizeBytes < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function getChatAttachmentExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();
  const extension = normalizedName.split(".").pop();

  if (!extension || extension === normalizedName) {
    return "";
  }

  return extension;
}

export function sanitizeChatAttachmentName(fileName: string) {
  const collapsedWhitespace = fileName.replace(/\s+/g, " ").trim();
  const withoutControlCharacters = collapsedWhitespace.replace(/[\u0000-\u001f\u007f]/g, "");
  const withoutPathSeparators = withoutControlCharacters.replace(/[\\/]+/g, "-");
  const sanitized = withoutPathSeparators.slice(0, chatAttachmentLimits.maxFilenameLength).trim();

  return sanitized || "attachment";
}

export function getChatAttachmentDescriptor(fileName: string, mimeType?: string | null) {
  const extension = getChatAttachmentExtension(fileName);
  const normalizedMimeType = (mimeType || "").trim().toLowerCase();
  const byExtension = extension ? chatAttachmentTypeByExtension.get(extension) : undefined;
  const byMimeType = normalizedMimeType ? chatAttachmentTypeByMime.get(normalizedMimeType) : undefined;

  if (!byExtension && !byMimeType) {
    return null;
  }

  if (byExtension && byMimeType && byExtension.extension !== byMimeType.extension) {
    return null;
  }

  const resolvedType = byExtension ?? byMimeType;

  if (!resolvedType) {
    return null;
  }

  return {
    acceptedMimeTypes: resolvedType.mimeTypes,
    extension: resolvedType.extension,
    label: resolvedType.label,
    normalizedMimeType: byMimeType ? normalizedMimeType : resolvedType.mimeTypes[0],
    previewKind: resolvedType.previewKind,
  } satisfies ChatAttachmentDescriptor;
}

export function validateChatAttachmentCandidate(args: {
  mimeType?: string | null;
  name: string;
  sizeBytes: number;
}) {
  if (!args.name.trim()) {
    return {
      message: "Selected files need a valid file name.",
      ok: false,
    } satisfies ChatAttachmentValidationResult;
  }

  if (args.sizeBytes <= 0) {
    return {
      message: "Selected files cannot be empty.",
      ok: false,
    } satisfies ChatAttachmentValidationResult;
  }

  if (args.sizeBytes > chatAttachmentLimits.maxFileSizeBytes) {
    return {
      message: `Keep attachments under ${formatChatAttachmentSize(chatAttachmentLimits.maxFileSizeBytes)} each.`,
      ok: false,
    } satisfies ChatAttachmentValidationResult;
  }

  const sanitizedName = sanitizeChatAttachmentName(args.name);
  const descriptor = getChatAttachmentDescriptor(sanitizedName, args.mimeType);

  if (!descriptor) {
    return {
      message:
        "Only PDFs, CSVs, text files, Word docs, Excel sheets, PowerPoints, PNGs, JPGs, JPEGs, and WEBPs are supported right now.",
      ok: false,
    } satisfies ChatAttachmentValidationResult;
  }

  return {
    descriptor,
    ok: true,
    sanitizedName,
  } satisfies ChatAttachmentValidationResult;
}
