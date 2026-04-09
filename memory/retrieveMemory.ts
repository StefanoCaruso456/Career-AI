import { randomUUID } from "node:crypto";
import { retrievalTraceSchema } from "./retrievalSchema";
import { rankInstructionMemories, rankProjectMemories, rankSemanticMemories } from "./ranking";
import { appendMemoryAuditEvent, ensureMemoryLayout, loadSemanticMemoryRecords } from "./storage";
import type {
  InstructionMemoryEntry,
  MemoryScope,
  ProjectMemoryEntry,
  RetrievalTrace,
  SemanticMemoryRecord,
} from "./memoryTypes";

function normalizeValue(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function scopeMatches(scopes: MemoryScope[], recordScope: MemoryScope) {
  if (recordScope === "global") {
    return true;
  }

  if (scopes.includes(recordScope)) {
    return true;
  }

  if (recordScope === "workspace" && scopes.includes("repo")) {
    return true;
  }

  if ((recordScope === "thread" || recordScope === "agent") && scopes.includes("workspace")) {
    return true;
  }

  return false;
}

function detectRepoAuthorityNotes(repoEntries: ProjectMemoryEntry[], semanticEntries: SemanticMemoryRecord[]) {
  const notes: string[] = [];

  for (const repoEntry of repoEntries) {
    const repoTitle = normalizeValue(repoEntry.title);
    const semanticConflict = semanticEntries.find(
      (semanticEntry) =>
        semanticEntry.status === "active" &&
        normalizeValue(semanticEntry.title) === repoTitle &&
        normalizeValue(semanticEntry.content) !== normalizeValue(repoEntry.content),
    );

    if (semanticConflict) {
      notes.push(
        `Repo source ${repoEntry.source_reference} overrides semantic memory ${semanticConflict.id} for "${repoEntry.title}".`,
      );
    }
  }

  return notes;
}

export async function retrieveMemory(
  input: {
    query: string;
    scopes: MemoryScope[];
    instructionMemories?: InstructionMemoryEntry[];
    repoMemories?: ProjectMemoryEntry[];
    baseDir?: string;
    limitPerLayer?: number;
    now?: Date;
  },
): Promise<RetrievalTrace> {
  const baseDir = input.baseDir ?? process.cwd();
  const now = input.now ?? new Date();
  const limitPerLayer = input.limitPerLayer ?? 5;
  await ensureMemoryLayout(baseDir);

  const semanticRecords = (await loadSemanticMemoryRecords(baseDir)).filter(
    (record) => record.status === "active" && scopeMatches(input.scopes, record.scope),
  );
  const instructionResults = rankInstructionMemories(
    input.query,
    input.scopes,
    input.instructionMemories ?? [],
  ).slice(0, limitPerLayer);
  const semanticResults = rankSemanticMemories(input.query, input.scopes, semanticRecords, now).slice(0, limitPerLayer);
  const repoResults = rankProjectMemories(input.query, input.scopes, input.repoMemories ?? []).slice(0, limitPerLayer);
  const authorityNotes = detectRepoAuthorityNotes(input.repoMemories ?? [], semanticRecords);

  const trace: RetrievalTrace = retrievalTraceSchema.parse({
    query: input.query,
    scopes: input.scopes,
    retrieved_at: now.toISOString(),
    authority_notes: authorityNotes,
    layers: [
      {
        layer: "instruction",
        considered_count: input.instructionMemories?.length ?? 0,
        returned_count: instructionResults.length,
        results: instructionResults,
      },
      {
        layer: "semantic",
        considered_count: semanticRecords.length,
        returned_count: semanticResults.length,
        results: semanticResults,
      },
      {
        layer: "repo",
        considered_count: input.repoMemories?.length ?? 0,
        returned_count: repoResults.length,
        results: repoResults,
      },
    ],
    context_package: [...instructionResults, ...semanticResults, ...repoResults],
  });

  await appendMemoryAuditEvent(baseDir, {
    id: `audit_${randomUUID()}`,
    event_type: "memory_retrieved",
    memory_id: null,
    timestamp: now.toISOString(),
    details: {
      query: input.query,
      scopes: input.scopes,
      layer_counts: trace.layers.map((layer) => ({
        layer: layer.layer,
        returned_count: layer.returned_count,
      })),
      authority_notes: trace.authority_notes,
    },
  });

  return trace;
}
