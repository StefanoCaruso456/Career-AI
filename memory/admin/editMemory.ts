import { randomUUID } from "node:crypto";
import { semanticMemoryRecordSchema } from "../schema";
import { appendMemoryAuditEvent, loadSemanticMemoryRecords, saveSemanticMemoryRecords } from "../storage";

export async function editMemory(
  memoryId: string,
  updates: {
    title?: string;
    content?: string;
    tags?: string[];
    confidence?: number;
    retrieval_hints?: string[];
    write_reason?: string;
  },
  options?: {
    baseDir?: string;
    now?: Date;
  },
) {
  const baseDir = options?.baseDir ?? process.cwd();
  const now = options?.now ?? new Date();
  const records = await loadSemanticMemoryRecords(baseDir);
  const index = records.findIndex((record) => record.id === memoryId);

  if (index < 0) {
    return null;
  }

  const currentRecord = records[index];
  const nextRecord = semanticMemoryRecordSchema.parse({
    ...currentRecord,
    ...updates,
    updated_at: now.toISOString(),
    version: currentRecord.version + 1,
  });
  records[index] = nextRecord;
  await saveSemanticMemoryRecords(baseDir, records);
  await appendMemoryAuditEvent(baseDir, {
    id: `audit_${randomUUID()}`,
    event_type: "memory_edited",
    memory_id: memoryId,
    timestamp: now.toISOString(),
    details: {
      updated_fields: Object.keys(updates),
    },
  });

  return nextRecord;
}
