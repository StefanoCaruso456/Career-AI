import { inspectMemory } from "./inspectMemory";
import { retrieveMemory } from "../retrieveMemory";
import type { InstructionMemoryEntry, MemoryScope, ProjectMemoryEntry } from "../memoryTypes";

export async function traceMemory(input: {
  memoryId?: string;
  query?: string;
  scopes?: MemoryScope[];
  baseDir?: string;
  instructionMemories?: InstructionMemoryEntry[];
  repoMemories?: ProjectMemoryEntry[];
}) {
  if (input.memoryId) {
    return inspectMemory(input.memoryId, input.baseDir);
  }

  if (!input.query || !input.scopes) {
    throw new Error("traceMemory requires either memoryId or query plus scopes.");
  }

  return retrieveMemory({
    query: input.query,
    scopes: input.scopes,
    baseDir: input.baseDir,
    instructionMemories: input.instructionMemories,
    repoMemories: input.repoMemories,
  });
}
