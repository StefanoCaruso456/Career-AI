import { loadSemanticMemoryRecords } from "../storage";
import type { MemoryScope, MemoryStatus, SemanticMemoryType } from "../memoryTypes";

export async function listMemory(
  options?: {
    baseDir?: string;
    scope?: MemoryScope;
    status?: MemoryStatus;
    memoryType?: SemanticMemoryType;
    tag?: string;
  },
) {
  const records = await loadSemanticMemoryRecords(options?.baseDir);

  return records.filter((record) => {
    if (options?.scope && record.scope !== options.scope) {
      return false;
    }

    if (options?.status && record.status !== options.status) {
      return false;
    }

    if (options?.memoryType && record.memory_type !== options.memoryType) {
      return false;
    }

    if (options?.tag && !record.tags.includes(options.tag)) {
      return false;
    }

    return true;
  });
}
