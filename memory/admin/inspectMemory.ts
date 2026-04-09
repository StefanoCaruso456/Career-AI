import { loadMemoryAuditEvents, loadSemanticMemoryRecords } from "../storage";

export async function inspectMemory(memoryId: string, baseDir = process.cwd()) {
  const [records, auditEvents] = await Promise.all([
    loadSemanticMemoryRecords(baseDir),
    loadMemoryAuditEvents(baseDir),
  ]);
  const record = records.find((item) => item.id === memoryId) ?? null;

  return {
    record,
    auditTrail: auditEvents.filter((event) => event.memory_id === memoryId),
  };
}
