import { randomUUID } from "node:crypto";
import { appendMemoryAuditEvent, loadSemanticMemoryRecords, saveSemanticMemoryRecords } from "../storage";

export async function deleteMemory(
  memoryId: string,
  reason: string,
  options?: {
    baseDir?: string;
    now?: Date;
  },
) {
  const baseDir = options?.baseDir ?? process.cwd();
  const now = options?.now ?? new Date();
  const records = await loadSemanticMemoryRecords(baseDir);
  const nextRecords = records.map((record) =>
    record.id === memoryId
      ? {
          ...record,
          status: "deleted" as const,
          updated_at: now.toISOString(),
          version: record.version + 1,
        }
      : record,
  );

  if (nextRecords.every((record) => record.id !== memoryId || record.status !== "deleted")) {
    return null;
  }

  await saveSemanticMemoryRecords(baseDir, nextRecords);
  await appendMemoryAuditEvent(baseDir, {
    id: `audit_${randomUUID()}`,
    event_type: "memory_deleted",
    memory_id: memoryId,
    timestamp: now.toISOString(),
    details: {
      reason,
    },
  });

  return nextRecords.find((record) => record.id === memoryId) ?? null;
}
