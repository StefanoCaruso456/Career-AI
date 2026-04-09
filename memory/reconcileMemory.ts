import { randomUUID } from "node:crypto";
import { appendMemoryAuditEvent, ensureMemoryLayout, loadSemanticMemoryRecords, saveSemanticMemoryRecords } from "./storage";
import type { ReconciliationConflict, ReconciliationResult, SemanticMemoryRecord } from "./memoryTypes";

function normalizeValue(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortByPriority(records: SemanticMemoryRecord[]) {
  return [...records].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
  });
}

export function findDuplicateMemoryGroups(records: SemanticMemoryRecord[]) {
  const groups = new Map<string, SemanticMemoryRecord[]>();

  for (const record of records.filter((item) => item.status === "active")) {
    const key = [
      record.scope,
      record.memory_type,
      normalizeValue(record.title),
      normalizeValue(record.content),
    ].join("::");
    const bucket = groups.get(key) ?? [];
    bucket.push(record);
    groups.set(key, bucket);
  }

  return [...groups.values()].filter((group) => group.length > 1);
}

export function findContradictoryMemories(records: SemanticMemoryRecord[]): ReconciliationConflict[] {
  const groups = new Map<string, SemanticMemoryRecord[]>();

  for (const record of records.filter((item) => item.status === "active")) {
    const key = [record.scope, record.memory_type, normalizeValue(record.title)].join("::");
    const bucket = groups.get(key) ?? [];
    bucket.push(record);
    groups.set(key, bucket);
  }

  return [...groups.values()]
    .filter((group) => new Set(group.map((item) => normalizeValue(item.content))).size > 1)
    .map((group) => ({
      title: group[0]?.title ?? "unknown",
      scope: group[0]?.scope ?? "workspace",
      memory_ids: group.map((item) => item.id),
      contents: group.map((item) => item.content),
    }));
}

export async function reconcileSemanticMemory(
  options?: {
    baseDir?: string;
    now?: Date;
  },
): Promise<ReconciliationResult> {
  const baseDir = options?.baseDir ?? process.cwd();
  const now = options?.now ?? new Date();
  await ensureMemoryLayout(baseDir);

  const records = await loadSemanticMemoryRecords(baseDir);
  const duplicateGroups = findDuplicateMemoryGroups(records);
  const contradictoryGroups = findContradictoryMemories(records);
  const supersededIds: string[] = [];
  const dedupedIds: string[] = [];

  const nextRecords = records.map((record) => ({ ...record }));

  for (const group of duplicateGroups) {
    const [winner, ...duplicates] = sortByPriority(group);
    dedupedIds.push(winner.id);

    for (const duplicate of duplicates) {
      const nextRecord = nextRecords.find((record) => record.id === duplicate.id);

      if (!nextRecord) {
        continue;
      }

      nextRecord.status = "superseded";
      nextRecord.updated_at = now.toISOString();
      nextRecord.version += 1;
      supersededIds.push(nextRecord.id);
    }
  }

  if (supersededIds.length > 0) {
    await saveSemanticMemoryRecords(baseDir, nextRecords);
  }

  for (const supersededId of supersededIds) {
    await appendMemoryAuditEvent(baseDir, {
      id: `audit_${randomUUID()}`,
      event_type: "memory_superseded",
      memory_id: supersededId,
      timestamp: now.toISOString(),
      details: {
        reason: "Duplicate memory reconciled during compaction.",
      },
    });
  }

  for (const conflict of contradictoryGroups) {
    await appendMemoryAuditEvent(baseDir, {
      id: `audit_${randomUUID()}`,
      event_type: "memory_conflict_detected",
      memory_id: null,
      timestamp: now.toISOString(),
      details: {
        title: conflict.title,
        scope: conflict.scope,
        memory_ids: conflict.memory_ids,
      },
    });
  }

  return {
    deduped_memory_ids: dedupedIds,
    superseded_memory_ids: supersededIds,
    conflicts: contradictoryGroups,
  };
}
