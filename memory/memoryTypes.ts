export const memoryLayerValues = [
  "working",
  "session",
  "semantic",
  "instruction",
  "repo",
] as const;

export type MemoryLayer = (typeof memoryLayerValues)[number];

export const semanticMemoryTypeValues = [
  "user_preference",
  "project_fact",
  "org_fact",
  "workflow_pattern",
  "relationship",
  "identity_fact",
] as const;

export type SemanticMemoryType = (typeof semanticMemoryTypeValues)[number];

export const memoryScopeValues = [
  "global",
  "workspace",
  "repo",
  "thread",
  "agent",
] as const;

export type MemoryScope = (typeof memoryScopeValues)[number];

export const memorySourceKindValues = [
  "conversation",
  "file",
  "repo",
  "manual",
  "system",
] as const;

export type MemorySourceKind = (typeof memorySourceKindValues)[number];

export const memoryAssertionModeValues = [
  "user_stated",
  "system_inferred",
  "repo_confirmed",
  "agent_assumed",
] as const;

export type MemoryAssertionMode = (typeof memoryAssertionModeValues)[number];

export const memoryOwnerValues = ["user", "system", "agent"] as const;

export type MemoryOwner = (typeof memoryOwnerValues)[number];

export const memoryVisibilityValues = ["private", "workspace", "repo"] as const;

export type MemoryVisibility = (typeof memoryVisibilityValues)[number];

export const memoryStatusValues = ["active", "superseded", "deleted"] as const;

export type MemoryStatus = (typeof memoryStatusValues)[number];

export type MemorySource = {
  kind: MemorySourceKind;
  reference: string;
  assertion_mode: MemoryAssertionMode;
};

export type SemanticMemoryRecord = {
  id: string;
  memory_type: SemanticMemoryType;
  scope: MemoryScope;
  title: string;
  content: string;
  tags: string[];
  source: MemorySource;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  expires_at: string | null;
  owner: MemoryOwner;
  visibility: MemoryVisibility;
  write_reason: string;
  retrieval_hints: string[];
  version: number;
  status: MemoryStatus;
};

export type MemoryWriteCandidate = Omit<
  SemanticMemoryRecord,
  "id" | "created_at" | "updated_at" | "last_accessed_at" | "version" | "status"
> & {
  id?: string;
  version?: number;
  status?: MemoryStatus;
};

export type SessionMemoryEntry = {
  id: string;
  thread_id: string;
  scope: Extract<MemoryScope, "workspace" | "repo" | "thread" | "agent">;
  title: string;
  summary: string;
  decision_points: string[];
  requested_actions: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type CompactedSessionMemory = {
  id: string;
  thread_id: string;
  summary_title: string;
  summary: string;
  compressed_entry_ids: string[];
  created_at: string;
};

export type InstructionMemoryEntry = {
  id: string;
  title: string;
  content: string;
  scope: "global" | "workspace" | "repo";
  source_reference: string;
  tags: string[];
};

export type ProjectMemoryEntry = {
  id: string;
  title: string;
  content: string;
  scope: Extract<MemoryScope, "workspace" | "repo">;
  source_reference: string;
  source_kind: Extract<MemorySourceKind, "file" | "repo">;
  tags: string[];
};

export type WriteClass = "always" | "sometimes" | "never";

export type MemoryWriteDecision = {
  accepted: boolean;
  write_class: WriteClass;
  reason: string;
  stability_score: number;
  duplicate_of_memory_id?: string;
  superseded_memory_ids?: string[];
};

export type MemoryWriteResult = {
  decision: MemoryWriteDecision;
  record: SemanticMemoryRecord | null;
};

export type RetrievedMemory = {
  id: string;
  layer: Extract<MemoryLayer, "instruction" | "semantic" | "repo">;
  scope: MemoryScope | "global";
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  score: number;
  source: {
    kind: MemorySourceKind | "instruction";
    reference: string;
  };
  why_retrieved: string[];
  authoritative: boolean;
};

export type RetrievalLayerTrace = {
  layer: Extract<MemoryLayer, "instruction" | "semantic" | "repo">;
  considered_count: number;
  returned_count: number;
  results: RetrievedMemory[];
};

export type RetrievalTrace = {
  query: string;
  scopes: MemoryScope[];
  retrieved_at: string;
  authority_notes: string[];
  layers: RetrievalLayerTrace[];
  context_package: RetrievedMemory[];
};

export type MemoryAuditEventType =
  | "memory_write_accepted"
  | "memory_write_rejected"
  | "memory_retrieved"
  | "memory_superseded"
  | "memory_deleted"
  | "memory_edited"
  | "memory_conflict_detected"
  | "memory_compacted";

export type MemoryAuditEvent = {
  id: string;
  event_type: MemoryAuditEventType;
  memory_id: string | null;
  timestamp: string;
  details: Record<string, unknown>;
};

export type ReconciliationConflict = {
  title: string;
  scope: MemoryScope;
  memory_ids: string[];
  contents: string[];
};

export type ReconciliationResult = {
  deduped_memory_ids: string[];
  superseded_memory_ids: string[];
  conflicts: ReconciliationConflict[];
};

export type CompactionResult = {
  compacted_sessions: CompactedSessionMemory[];
  reconciled_semantic_memories: ReconciliationResult;
};
