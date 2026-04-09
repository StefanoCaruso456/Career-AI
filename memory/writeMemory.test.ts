import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSemanticMemoryRecords } from "./storage";
import { persistMemoryCandidate } from "./writeMemory";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "career-ai-memory-write-"));
}

describe("persistMemoryCandidate", () => {
  it("accepts a stable user preference memory with provenance", async () => {
    const baseDir = await makeTempDir();
    const result = await persistMemoryCandidate(
      {
        memory_type: "user_preference",
        scope: "global",
        title: "User prefers concise architecture docs",
        content: "The user prefers concise, audit-friendly architecture documentation.",
        tags: ["documentation", "preference"],
        source: {
          kind: "conversation",
          reference: "thread_001",
          assertion_mode: "user_stated",
        },
        confidence: 0.9,
        expires_at: null,
        owner: "system",
        visibility: "private",
        write_reason: "Repeated stable user preference across sessions",
        retrieval_hints: ["concise", "architecture", "audit"],
      },
      { baseDir, now: new Date("2026-04-09T18:00:00.000Z") },
    );

    expect(result.decision.accepted).toBe(true);
    expect(result.record?.id).toMatch(/^mem_/);
    expect(result.record?.source.assertion_mode).toBe("user_stated");
  });

  it("rejects low-confidence transient candidates", async () => {
    const baseDir = await makeTempDir();
    const result = await persistMemoryCandidate(
      {
        memory_type: "workflow_pattern",
        scope: "thread",
        title: "Temporary draft plan",
        content: "Temporary draft for today's one-off troubleshooting task.",
        tags: ["transient", "draft"],
        source: {
          kind: "conversation",
          reference: "thread_002",
          assertion_mode: "system_inferred",
        },
        confidence: 0.55,
        expires_at: null,
        owner: "system",
        visibility: "private",
        write_reason: "Transient draft during active task",
        retrieval_hints: ["draft"],
      },
      { baseDir },
    );

    expect(result.decision.accepted).toBe(false);
    expect(result.record).toBeNull();
  });

  it("supersedes an older fact when a corrected replacement is written", async () => {
    const baseDir = await makeTempDir();

    const first = await persistMemoryCandidate(
      {
        memory_type: "project_fact",
        scope: "repo",
        title: "Default publish workflow",
        content: "The workflow ends after PR creation.",
        tags: ["workflow", "publish"],
        source: {
          kind: "conversation",
          reference: "thread_003",
          assertion_mode: "user_stated",
        },
        confidence: 0.82,
        expires_at: null,
        owner: "system",
        visibility: "repo",
        write_reason: "Initial project workflow statement",
        retrieval_hints: ["publish", "workflow"],
      },
      { baseDir, now: new Date("2026-04-09T18:00:00.000Z") },
    );

    const second = await persistMemoryCandidate(
      {
        memory_type: "project_fact",
        scope: "repo",
        title: "Default publish workflow",
        content: "The workflow ends after PR creation and merge to main.",
        tags: ["workflow", "publish"],
        source: {
          kind: "conversation",
          reference: "thread_004",
          assertion_mode: "user_stated",
        },
        confidence: 0.92,
        expires_at: null,
        owner: "system",
        visibility: "repo",
        write_reason: "User corrected the standing workflow",
        retrieval_hints: ["publish", "workflow", "merge"],
      },
      { baseDir, now: new Date("2026-04-09T18:05:00.000Z") },
    );

    const records = await loadSemanticMemoryRecords(baseDir);
    const original = records.find((record) => record.id === first.record?.id);
    const replacement = records.find((record) => record.id === second.record?.id);

    expect(second.decision.accepted).toBe(true);
    expect(original?.status).toBe("superseded");
    expect(replacement?.status).toBe("active");
  });
});
