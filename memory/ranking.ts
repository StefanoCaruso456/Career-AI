import type {
  InstructionMemoryEntry,
  MemoryScope,
  ProjectMemoryEntry,
  RetrievedMemory,
  SemanticMemoryRecord,
} from "./memoryTypes";

function tokenize(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function uniqueTokens(input: string) {
  return new Set(tokenize(input));
}

function computeOverlap(query: string, text: string) {
  const queryTokens = uniqueTokens(query);
  const textTokens = uniqueTokens(text);

  if (queryTokens.size === 0 || textTokens.size === 0) {
    return 0;
  }

  let matches = 0;

  for (const token of queryTokens) {
    if (textTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / queryTokens.size;
}

function computeRecencyScore(isoTimestamp: string, now = new Date()) {
  const updatedAt = new Date(isoTimestamp);
  const ageDays = Math.max(0, (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays <= 7) {
    return 1;
  }

  if (ageDays <= 30) {
    return 0.85;
  }

  if (ageDays <= 90) {
    return 0.65;
  }

  return 0.4;
}

function computeScopeScore(scopes: MemoryScope[], recordScope: MemoryScope | "global") {
  if (scopes.includes(recordScope as MemoryScope)) {
    return 1;
  }

  if (recordScope === "global") {
    return 0.8;
  }

  if (recordScope === "workspace" && scopes.includes("repo")) {
    return 0.7;
  }

  if ((recordScope === "thread" || recordScope === "agent") && scopes.includes("workspace")) {
    return 0.75;
  }

  return 0.25;
}

function computeSourcePriority(kind: "conversation" | "file" | "repo" | "manual" | "system" | "instruction") {
  switch (kind) {
    case "repo":
      return 1;
    case "file":
      return 0.95;
    case "instruction":
      return 0.92;
    case "manual":
      return 0.88;
    case "system":
      return 0.82;
    case "conversation":
      return 0.76;
  }
}

function buildWhyRetrieved(relevance: number, scopeMatch: number, confidence: number, recency: number) {
  const reasons: string[] = [];

  if (relevance >= 0.34) {
    reasons.push("high keyword overlap");
  }

  if (scopeMatch >= 0.8) {
    reasons.push("scope aligned");
  }

  if (confidence >= 0.85) {
    reasons.push("high confidence");
  }

  if (recency >= 0.85) {
    reasons.push("recently updated");
  }

  return reasons.length > 0 ? reasons : ["fallback retrieval"];
}

export function rankSemanticMemories(
  query: string,
  scopes: MemoryScope[],
  records: SemanticMemoryRecord[],
  now = new Date(),
): RetrievedMemory[] {
  return records
    .filter((record) => record.status === "active")
    .map((record) => {
      const relevance = computeOverlap(
        query,
        [record.title, record.content, record.tags.join(" "), record.retrieval_hints.join(" ")].join(" "),
      );
      const recency = computeRecencyScore(record.updated_at, now);
      const scopeMatch = computeScopeScore(scopes, record.scope);
      const sourcePriority = computeSourcePriority(record.source.kind);
      const score =
        relevance * 0.42 +
        record.confidence * 0.24 +
        scopeMatch * 0.16 +
        recency * 0.12 +
        sourcePriority * 0.06;

      return {
        id: record.id,
        layer: "semantic",
        scope: record.scope,
        title: record.title,
        content: record.content,
        tags: record.tags,
        confidence: record.confidence,
        score,
        source: {
          kind: record.source.kind,
          reference: record.source.reference,
        },
        why_retrieved: buildWhyRetrieved(relevance, scopeMatch, record.confidence, recency),
        authoritative: false,
      } satisfies RetrievedMemory;
    })
    .sort((left, right) => right.score - left.score);
}

export function rankInstructionMemories(
  query: string,
  scopes: MemoryScope[],
  entries: InstructionMemoryEntry[],
): RetrievedMemory[] {
  return entries
    .map((entry) => {
      const relevance = computeOverlap(query, [entry.title, entry.content, entry.tags.join(" ")].join(" "));
      const scopeMatch = computeScopeScore(scopes, entry.scope);
      const score = relevance * 0.6 + scopeMatch * 0.25 + computeSourcePriority("instruction") * 0.15;

      return {
        id: entry.id,
        layer: "instruction",
        scope: entry.scope,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        confidence: 1,
        score,
        source: {
          kind: "instruction",
          reference: entry.source_reference,
        },
        why_retrieved: buildWhyRetrieved(relevance, scopeMatch, 1, 1),
        authoritative: true,
      } satisfies RetrievedMemory;
    })
    .sort((left, right) => right.score - left.score);
}

export function rankProjectMemories(
  query: string,
  scopes: MemoryScope[],
  entries: ProjectMemoryEntry[],
): RetrievedMemory[] {
  return entries
    .map((entry) => {
      const relevance = computeOverlap(query, [entry.title, entry.content, entry.tags.join(" ")].join(" "));
      const scopeMatch = computeScopeScore(scopes, entry.scope);
      const sourcePriority = computeSourcePriority(entry.source_kind);
      const score = relevance * 0.55 + scopeMatch * 0.25 + sourcePriority * 0.2;

      return {
        id: entry.id,
        layer: "repo",
        scope: entry.scope,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        confidence: 1,
        score,
        source: {
          kind: entry.source_kind,
          reference: entry.source_reference,
        },
        why_retrieved: buildWhyRetrieved(relevance, scopeMatch, 1, 1),
        authoritative: true,
      } satisfies RetrievedMemory;
    })
    .sort((left, right) => right.score - left.score);
}
