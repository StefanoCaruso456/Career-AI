import { randomUUID } from "node:crypto";
import { appendMemoryAuditEvent } from "./storage";
import { reconcileSemanticMemory } from "./reconcileMemory";
import type { CompactedSessionMemory, CompactionResult, SessionMemoryEntry } from "./memoryTypes";

function makeCompactSummary(threadId: string, entries: SessionMemoryEntry[], timestamp: string): CompactedSessionMemory {
  const titles = [...new Set(entries.map((entry) => entry.title.trim()))];
  const decisionPoints = [...new Set(entries.flatMap((entry) => entry.decision_points))];
  const requestedActions = [...new Set(entries.flatMap((entry) => entry.requested_actions))];

  return {
    id: `sesscompact_${randomUUID()}`,
    thread_id: threadId,
    summary_title: titles[0] ?? "Compacted session summary",
    summary: [
      `Compacted ${entries.length} session entries.`,
      decisionPoints.length > 0 ? `Key decisions: ${decisionPoints.join("; ")}.` : "",
      requestedActions.length > 0 ? `Requested actions: ${requestedActions.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    compressed_entry_ids: entries.map((entry) => entry.id),
    created_at: timestamp,
  };
}

export function compactSessionMemories(
  entries: SessionMemoryEntry[],
  options?: {
    staleAfterDays?: number;
    now?: Date;
  },
) {
  const now = options?.now ?? new Date();
  const staleAfterDays = options?.staleAfterDays ?? 14;
  const staleThreshold = now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000;
  const grouped = new Map<string, SessionMemoryEntry[]>();

  for (const entry of entries) {
    if (new Date(entry.updated_at).getTime() > staleThreshold) {
      continue;
    }

    const bucket = grouped.get(entry.thread_id) ?? [];
    bucket.push(entry);
    grouped.set(entry.thread_id, bucket);
  }

  return [...grouped.entries()].map(([threadId, threadEntries]) =>
    makeCompactSummary(threadId, threadEntries, now.toISOString()),
  );
}

export async function compactMemory(
  input: {
    sessionEntries: SessionMemoryEntry[];
    baseDir?: string;
    now?: Date;
  },
): Promise<CompactionResult> {
  const now = input.now ?? new Date();
  const compactedSessions = compactSessionMemories(input.sessionEntries, { now });
  const reconciledSemanticMemories = await reconcileSemanticMemory({
    baseDir: input.baseDir,
    now,
  });

  if (input.baseDir) {
    await appendMemoryAuditEvent(input.baseDir, {
      id: `audit_${randomUUID()}`,
      event_type: "memory_compacted",
      memory_id: null,
      timestamp: now.toISOString(),
      details: {
        compacted_session_count: compactedSessions.length,
        superseded_memory_count: reconciledSemanticMemories.superseded_memory_ids.length,
        conflict_count: reconciledSemanticMemories.conflicts.length,
      },
    });
  }

  return {
    compacted_sessions: compactedSessions,
    reconciled_semantic_memories: reconciledSemanticMemories,
  };
}
