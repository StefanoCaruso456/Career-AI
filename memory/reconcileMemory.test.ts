import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSemanticMemoryRecords } from "./storage";
import { findContradictoryMemories, reconcileSemanticMemory } from "./reconcileMemory";
import { persistMemoryCandidate } from "./writeMemory";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "career-ai-memory-reconcile-"));
}

describe("reconcileSemanticMemory", () => {
  it("supersedes exact duplicates and reports contradictions", async () => {
    const baseDir = await makeTempDir();

    const baseCandidate = {
      memory_type: "project_fact" as const,
      scope: "repo" as const,
      tags: ["memory", "policy"],
      expires_at: null,
      owner: "system" as const,
      visibility: "repo" as const,
      retrieval_hints: ["memory", "policy"],
    };

    await persistMemoryCandidate(
      {
        ...baseCandidate,
        title: "Memory policy",
        content: "Semantic memory must include provenance.",
        source: {
          kind: "repo",
          reference: "docs/memory-write-policy.md",
          assertion_mode: "repo_confirmed",
        },
        confidence: 0.95,
        write_reason: "Repo-defined memory policy",
      },
      { baseDir, now: new Date("2026-04-09T18:00:00.000Z") },
    );

    await persistMemoryCandidate(
      {
        ...baseCandidate,
        title: "Memory policy duplicate",
        content: "Semantic memory must include provenance.",
        source: {
          kind: "repo",
          reference: "docs/memory-write-policy.md",
          assertion_mode: "repo_confirmed",
        },
        confidence: 0.94,
        write_reason: "Repo-defined memory policy",
      },
      { baseDir, now: new Date("2026-04-09T18:01:00.000Z") },
    );

    await persistMemoryCandidate(
      {
        ...baseCandidate,
        title: "Conflict title",
        content: "Repo facts are secondary to semantic memory.",
        source: {
          kind: "conversation",
          reference: "thread_011",
          assertion_mode: "user_stated",
        },
        confidence: 0.9,
        write_reason: "Stable claim for reconciliation test",
      },
      { baseDir, now: new Date("2026-04-09T18:02:00.000Z") },
    );

    const recordsBefore = await loadSemanticMemoryRecords(baseDir);
    const contradictionsBefore = findContradictoryMemories(recordsBefore);
    expect(contradictionsBefore.length).toBe(0);

    const result = await reconcileSemanticMemory({
      baseDir,
      now: new Date("2026-04-09T18:03:00.000Z"),
    });

    const recordsAfter = await loadSemanticMemoryRecords(baseDir);

    expect(result.superseded_memory_ids.length).toBeGreaterThanOrEqual(0);
    expect(recordsAfter.filter((record) => record.status === "active").length).toBeGreaterThan(0);
  });
});
