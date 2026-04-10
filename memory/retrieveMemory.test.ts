import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { retrieveMemory } from "./retrieveMemory";
import { persistMemoryCandidate } from "./writeMemory";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "career-ai-memory-retrieve-"));
}

describe("retrieveMemory", () => {
  it("retrieves instruction, semantic, and repo layers with a trace", async () => {
    const baseDir = await makeTempDir();

    await persistMemoryCandidate(
      {
        memory_type: "user_preference",
        scope: "global",
        title: "User prefers concise docs",
        content: "Keep docs concise and best-practice oriented.",
        tags: ["docs", "preference"],
        source: {
          kind: "conversation",
          reference: "thread_001",
          assertion_mode: "user_stated",
        },
        confidence: 0.91,
        expires_at: null,
        owner: "system",
        visibility: "private",
        write_reason: "Repeated stable preference",
        retrieval_hints: ["concise", "docs"],
      },
      { baseDir },
    );

    const trace = await retrieveMemory({
      query: "write concise docs for this repo",
      scopes: ["repo"],
      baseDir,
      instructionMemories: [
        {
          id: "inst_repo_agents",
          title: "Publish and merge to main",
          content: "Show git commands, commit, push, PR, and merge to main when allowed.",
          scope: "repo",
          source_reference: "AGENTS.md",
          tags: ["git", "publish"],
        },
      ],
      repoMemories: [
        {
          id: "repo_doc_001",
          title: "Repo docs are authoritative",
          content: "Prefer docs/ files over semantic summaries for project facts.",
          scope: "repo",
          source_reference: "docs/memory-retrieval-policy.md",
          source_kind: "file",
          tags: ["repo", "source-of-truth"],
        },
      ],
    });

    expect(trace.layers.map((layer) => layer.layer)).toEqual(["instruction", "semantic", "repo"]);
    expect(trace.context_package[0]?.layer).toBe("instruction");
    expect(trace.context_package.some((entry) => entry.layer === "semantic")).toBe(true);
    expect(trace.context_package.some((entry) => entry.layer === "repo")).toBe(true);
  });

  it("does not leak thread-scoped memory into unrelated global retrieval", async () => {
    const baseDir = await makeTempDir();

    await persistMemoryCandidate(
      {
        memory_type: "workflow_pattern",
        scope: "thread",
        title: "Thread-only draft workflow",
        content: "Use a temporary thread-specific checklist for this bug hunt.",
        tags: ["workflow", "thread"],
        source: {
          kind: "conversation",
          reference: "thread_009",
          assertion_mode: "user_stated",
        },
        confidence: 0.9,
        expires_at: null,
        owner: "system",
        visibility: "private",
        write_reason: "Stable for this thread only",
        retrieval_hints: ["checklist", "thread"],
      },
      { baseDir },
    );

    const trace = await retrieveMemory({
      query: "global preferences",
      scopes: ["global"],
      baseDir,
    });

    expect(trace.layers.find((layer) => layer.layer === "semantic")?.results).toEqual([]);
  });
});
