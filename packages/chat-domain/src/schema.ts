import { z } from "zod";
import {
  chatAttachmentPreviewKindSchema,
  chatAttachmentStatusSchema,
  chatConversationLabelSourceSchema,
  chatMessageRoleSchema,
} from "@/packages/contracts/src";

export const chatDatabaseSchemaVersion = 1;

export const chatProjectRecordSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
  ownerId: z.string().trim().min(1),
  updatedAt: z.string().datetime(),
});

export const chatConversationRecordSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
  labelSource: chatConversationLabelSourceSchema,
  ownerId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  updatedAt: z.string().datetime(),
});

export const chatMessageRecordSchema = z.object({
  content: z.string(),
  conversationId: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  error: z.boolean().optional(),
  id: z.string().trim().min(1),
  ownerId: z.string().trim().min(1),
  role: chatMessageRoleSchema,
});

export const chatAttachmentRecordSchema = z.object({
  conversationId: z.string().trim().min(1).nullable(),
  createdAt: z.string().datetime(),
  extension: z.string().trim().min(1).max(16),
  id: z.string().trim().min(1),
  messageId: z.string().trim().min(1).nullable(),
  mimeType: z.string().trim().min(1).max(200),
  originalName: z.string().trim().min(1).max(180),
  ownerId: z.string().trim().min(1),
  previewKind: chatAttachmentPreviewKindSchema,
  scanStatus: z.enum(["not_scanned", "pending"]),
  sizeBytes: z.number().int().nonnegative(),
  status: chatAttachmentStatusSchema,
  storageKey: z.string().trim().min(1),
  updatedAt: z.string().datetime(),
});

export const chatDatabaseSchema = z.object({
  attachments: z.array(chatAttachmentRecordSchema),
  conversations: z.array(chatConversationRecordSchema),
  messages: z.array(chatMessageRecordSchema),
  projects: z.array(chatProjectRecordSchema),
  version: z.literal(chatDatabaseSchemaVersion),
});

export type ChatProjectRecord = z.infer<typeof chatProjectRecordSchema>;
export type ChatConversationRecord = z.infer<typeof chatConversationRecordSchema>;
export type ChatMessageRecord = z.infer<typeof chatMessageRecordSchema>;
export type ChatAttachmentRecord = z.infer<typeof chatAttachmentRecordSchema>;
export type ChatDatabase = z.infer<typeof chatDatabaseSchema>;
