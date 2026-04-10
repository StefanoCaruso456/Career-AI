import { randomUUID } from "node:crypto";
import {
  memoryWriteCandidateSchema,
  memoryWriteThresholds,
  semanticMemoryRecordSchema,
} from "./schema";
import {
  appendMemoryAuditEvent,
  ensureMemoryLayout,
  loadSemanticMemoryRecords,
  saveSemanticMemoryRecords,
} from "./storage";
import type {
  MemoryAuditEvent,
  MemoryScope,
  MemoryWriteCandidate,
  MemoryWriteDecision,
  MemoryWriteResult,
  SemanticMemoryRecord,
  WriteClass,
} from "./memoryTypes";

function normalizeValue(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function nowIso(now = new Date()) {
  return now.toISOString();
}

function buildAuditEvent(
  eventType: MemoryAuditEvent["event_type"],
  memoryId: string | null,
  details: Record<string, unknown>,
  timestamp = new Date(),
): MemoryAuditEvent {
  return {
    id: `audit_${randomUUID()}`,
    event_type: eventType,
    memory_id: memoryId,
    timestamp: nowIso(timestamp),
    details,
  };
}

export function classifyWriteClass(candidate: MemoryWriteCandidate): WriteClass {
  const tags = candidate.tags.map(normalizeValue);
  const writeReason = normalizeValue(candidate.write_reason);
  const transientIndicators = ["transient", "draft", "tool-log", "tool_log", "speculative", "one-off"];

  if (candidate.source.assertion_mode === "agent_assumed") {
    return "never";
  }

  if (
    transientIndicators.some((indicator) => tags.includes(indicator) || writeReason.includes(indicator)) ||
    normalizeValue(candidate.title).includes("temporary") ||
    normalizeValue(candidate.content).includes("temporary")
  ) {
    return "never";
  }

  if (candidate.memory_type === "user_preference" || candidate.memory_type === "identity_fact") {
    return "always";
  }

  if (candidate.memory_type === "project_fact" && candidate.scope !== "thread") {
    return "always";
  }

  return "sometimes";
}

export function scoreCandidateStability(candidate: MemoryWriteCandidate) {
  let score = candidate.confidence;

  switch (candidate.source.assertion_mode) {
    case "repo_confirmed":
      score += 0.12;
      break;
    case "user_stated":
      score += 0.08;
      break;
    case "system_inferred":
      score -= 0.04;
      break;
    case "agent_assumed":
      score -= 0.3;
      break;
  }

  switch (candidate.source.kind) {
    case "repo":
    case "file":
      score += 0.06;
      break;
    case "manual":
      score += 0.04;
      break;
    case "conversation":
      score -= 0.02;
      break;
    case "system":
      score += 0.02;
      break;
  }

  if (candidate.scope === "global" || candidate.scope === "repo") {
    score += 0.02;
  }

  return Math.min(1, Math.max(0, score));
}

function findDuplicateRecord(candidate: MemoryWriteCandidate, records: SemanticMemoryRecord[]) {
  const normalizedTitle = normalizeValue(candidate.title);
  const normalizedContent = normalizeValue(candidate.content);

  return records.find(
    (record) =>
      record.status === "active" &&
      record.scope === candidate.scope &&
      record.memory_type === candidate.memory_type &&
      normalizeValue(record.title) === normalizedTitle &&
      normalizeValue(record.content) === normalizedContent,
  );
}

function findConflictingRecords(candidate: MemoryWriteCandidate, records: SemanticMemoryRecord[]) {
  const normalizedTitle = normalizeValue(candidate.title);
  const normalizedContent = normalizeValue(candidate.content);

  return records.filter(
    (record) =>
      record.status === "active" &&
      record.scope === candidate.scope &&
      record.memory_type === candidate.memory_type &&
      normalizeValue(record.title) === normalizedTitle &&
      normalizeValue(record.content) !== normalizedContent,
  );
}

function makeRecord(candidate: MemoryWriteCandidate, timestamp = new Date()): SemanticMemoryRecord {
  const now = nowIso(timestamp);

  return semanticMemoryRecordSchema.parse({
    ...candidate,
    id: candidate.id ?? `mem_${randomUUID()}`,
    created_at: now,
    updated_at: now,
    last_accessed_at: now,
    version: candidate.version ?? 1,
    status: candidate.status ?? "active",
  });
}

function buildRejectedDecision(
  writeClass: WriteClass,
  reason: string,
  stabilityScore: number,
  details?: Partial<MemoryWriteDecision>,
): MemoryWriteDecision {
  return {
    accepted: false,
    write_class: writeClass,
    reason,
    stability_score: stabilityScore,
    ...details,
  };
}

function thresholdForWriteClass(writeClass: WriteClass) {
  switch (writeClass) {
    case "always":
      return memoryWriteThresholds.always;
    case "sometimes":
      return memoryWriteThresholds.sometimes;
    case "never":
      return 1;
  }
}

export async function persistMemoryCandidate(
  candidateInput: MemoryWriteCandidate,
  options?: {
    baseDir?: string;
    now?: Date;
  },
): Promise<MemoryWriteResult> {
  const baseDir = options?.baseDir ?? process.cwd();
  const timestamp = options?.now ?? new Date();
  await ensureMemoryLayout(baseDir);

  const candidate = memoryWriteCandidateSchema.parse(candidateInput);
  const writeClass = classifyWriteClass(candidate);
  const stabilityScore = scoreCandidateStability(candidate);
  const threshold = thresholdForWriteClass(writeClass);
  const records = await loadSemanticMemoryRecords(baseDir);

  if (writeClass === "never") {
    const decision = buildRejectedDecision(writeClass, "Candidate is not eligible for long-term storage.", stabilityScore);
    await appendMemoryAuditEvent(
      baseDir,
      buildAuditEvent("memory_write_rejected", null, { decision, candidate }, timestamp),
    );
    return { decision, record: null };
  }

  if (stabilityScore < threshold) {
    const decision = buildRejectedDecision(
      writeClass,
      `Candidate stability ${stabilityScore.toFixed(2)} is below threshold ${threshold.toFixed(2)}.`,
      stabilityScore,
    );
    await appendMemoryAuditEvent(
      baseDir,
      buildAuditEvent("memory_write_rejected", null, { decision, candidate }, timestamp),
    );
    return { decision, record: null };
  }

  const duplicate = findDuplicateRecord(candidate, records);

  if (duplicate) {
    const decision = buildRejectedDecision(
      writeClass,
      "Duplicate active memory already exists.",
      stabilityScore,
      { duplicate_of_memory_id: duplicate.id },
    );
    await appendMemoryAuditEvent(
      baseDir,
      buildAuditEvent("memory_write_rejected", duplicate.id, { decision, candidate }, timestamp),
    );
    return { decision, record: duplicate };
  }

  const conflicts = findConflictingRecords(candidate, records);
  const isCorrection = normalizeValue(candidate.write_reason).includes("correct");

  if (conflicts.length > 0 && !isCorrection && candidate.source.assertion_mode !== "repo_confirmed") {
    const decision = buildRejectedDecision(
      writeClass,
      "Conflicting active memory exists and candidate was not marked as a correction.",
      stabilityScore,
      { superseded_memory_ids: conflicts.map((record) => record.id) },
    );
    await appendMemoryAuditEvent(
      baseDir,
      buildAuditEvent(
        "memory_conflict_detected",
        null,
        { decision, candidate, conflicting_memory_ids: conflicts.map((record) => record.id) },
        timestamp,
      ),
    );
    return { decision, record: null };
  }

  const nextRecords = records.map((record) =>
    conflicts.some((conflict) => conflict.id === record.id)
      ? {
          ...record,
          status: "superseded" as const,
          updated_at: nowIso(timestamp),
          version: record.version + 1,
        }
      : record,
  );
  const record = makeRecord(candidate, timestamp);
  nextRecords.push(record);
  await saveSemanticMemoryRecords(baseDir, nextRecords);

  for (const conflict of conflicts) {
    await appendMemoryAuditEvent(
      baseDir,
      buildAuditEvent(
        "memory_superseded",
        conflict.id,
        { superseded_by_memory_id: record.id, reason: "Newer corrected memory accepted." },
        timestamp,
      ),
    );
  }

  const decision: MemoryWriteDecision = {
    accepted: true,
    write_class: writeClass,
    reason: conflicts.length > 0 ? "Candidate accepted and previous conflicting memories superseded." : "Candidate accepted.",
    stability_score: stabilityScore,
    superseded_memory_ids: conflicts.map((existingRecord) => existingRecord.id),
  };

  await appendMemoryAuditEvent(
    baseDir,
    buildAuditEvent("memory_write_accepted", record.id, { decision, candidate }, timestamp),
  );

  return { decision, record };
}

export async function listPersistableCandidates(
  candidates: MemoryWriteCandidate[],
  scope?: MemoryScope,
) {
  return candidates.filter((candidate) => {
    if (scope && candidate.scope !== scope) {
      return false;
    }

    return classifyWriteClass(candidate) !== "never";
  });
}
