import { z } from "zod";
import {
  memoryAssertionModeValues,
  memoryOwnerValues,
  memoryScopeValues,
  memorySourceKindValues,
  memoryStatusValues,
  memoryVisibilityValues,
  semanticMemoryTypeValues,
} from "./memoryTypes";

const isoDateTimeSchema = z.string().datetime({ offset: true });

export const memorySourceSchema = z.object({
  kind: z.enum(memorySourceKindValues),
  reference: z.string().min(1),
  assertion_mode: z.enum(memoryAssertionModeValues),
});

export const semanticMemoryRecordSchema = z.object({
  id: z.string().min(1),
  memory_type: z.enum(semanticMemoryTypeValues),
  scope: z.enum(memoryScopeValues),
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string().min(1)),
  source: memorySourceSchema,
  confidence: z.number().min(0).max(1),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  last_accessed_at: isoDateTimeSchema,
  expires_at: isoDateTimeSchema.nullable(),
  owner: z.enum(memoryOwnerValues),
  visibility: z.enum(memoryVisibilityValues),
  write_reason: z.string().min(1),
  retrieval_hints: z.array(z.string().min(1)),
  version: z.number().int().positive(),
  status: z.enum(memoryStatusValues),
});

export const memoryWriteCandidateSchema = semanticMemoryRecordSchema.omit({
  created_at: true,
  id: true,
  last_accessed_at: true,
  status: true,
  updated_at: true,
  version: true,
}).extend({
  id: z.string().min(1).optional(),
  status: z.enum(memoryStatusValues).optional(),
  version: z.number().int().positive().optional(),
});

export const sessionMemoryEntrySchema = z.object({
  id: z.string().min(1),
  thread_id: z.string().min(1),
  scope: z.enum(["workspace", "repo", "thread", "agent"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  decision_points: z.array(z.string()),
  requested_actions: z.array(z.string()),
  tags: z.array(z.string()),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export const instructionMemoryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  scope: z.enum(["global", "workspace", "repo"]),
  source_reference: z.string().min(1),
  tags: z.array(z.string()),
});

export const projectMemoryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  scope: z.enum(["workspace", "repo"]),
  source_reference: z.string().min(1),
  source_kind: z.enum(["file", "repo"]),
  tags: z.array(z.string()),
});

export const memoryAuditEventSchema = z.object({
  id: z.string().min(1),
  event_type: z.enum([
    "memory_write_accepted",
    "memory_write_rejected",
    "memory_retrieved",
    "memory_superseded",
    "memory_deleted",
    "memory_edited",
    "memory_conflict_detected",
    "memory_compacted",
  ]),
  memory_id: z.string().min(1).nullable(),
  timestamp: isoDateTimeSchema,
  details: z.record(z.string(), z.unknown()),
});

export const semanticMemoryIndexSchema = z.object({
  version: z.number().int().positive(),
  generated_at: isoDateTimeSchema,
  entries: z.record(
    z.string(),
    z.object({
      id: z.string().min(1),
      scope: z.enum(memoryScopeValues),
      title: z.string().min(1),
      tags: z.array(z.string()),
      retrieval_hints: z.array(z.string()),
      status: z.enum(memoryStatusValues),
      store_file: z.string().min(1),
      updated_at: isoDateTimeSchema,
    }),
  ),
});

export const memoryWriteThresholds = {
  always: 0.78,
  sometimes: 0.86,
};

export type SemanticMemoryRecordSchema = z.infer<typeof semanticMemoryRecordSchema>;
