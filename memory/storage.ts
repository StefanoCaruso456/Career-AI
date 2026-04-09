import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  MemoryAuditEvent,
  MemoryScope,
  SemanticMemoryRecord,
} from "./memoryTypes";
import { memoryAuditEventSchema, semanticMemoryIndexSchema, semanticMemoryRecordSchema } from "./schema";

type SemanticIndex = {
  version: number;
  generated_at: string;
  entries: Record<
    string,
    {
      id: string;
      scope: MemoryScope;
      title: string;
      tags: string[];
      retrieval_hints: string[];
      status: SemanticMemoryRecord["status"];
      store_file: string;
      updated_at: string;
    }
  >;
};

const STORE_FILE_BY_SCOPE: Record<MemoryScope, string> = {
  global: "global.jsonl",
  workspace: "workspace.jsonl",
  repo: "repo.jsonl",
  thread: "workspace.jsonl",
  agent: "workspace.jsonl",
};

export function getMemoryRoot(baseDir = process.cwd()) {
  return join(baseDir, "memory");
}

export function getSemanticStorePath(scope: MemoryScope, baseDir = process.cwd()) {
  return join(getMemoryRoot(baseDir), "store", STORE_FILE_BY_SCOPE[scope]);
}

export function getSemanticIndexPath(baseDir = process.cwd()) {
  return join(getMemoryRoot(baseDir), "indexes", "semantic.index.json");
}

export function getMemoryAuditLogPath(baseDir = process.cwd()) {
  return join(getMemoryRoot(baseDir), "logs", "memory-audit.jsonl");
}

async function ensureTextFile(path: string, initialContents = "") {
  await mkdir(dirname(path), { recursive: true });

  try {
    await readFile(path, "utf8");
  } catch {
    await writeFile(path, initialContents, "utf8");
  }
}

export async function ensureMemoryLayout(baseDir = process.cwd()) {
  const memoryRoot = getMemoryRoot(baseDir);

  await mkdir(join(memoryRoot, "schemas"), { recursive: true });
  await mkdir(join(memoryRoot, "store"), { recursive: true });
  await mkdir(join(memoryRoot, "indexes"), { recursive: true });
  await mkdir(join(memoryRoot, "logs"), { recursive: true });
  await mkdir(join(memoryRoot, "admin"), { recursive: true });
  await mkdir(join(memoryRoot, "examples"), { recursive: true });

  await ensureTextFile(join(memoryRoot, "store", "global.jsonl"), "");
  await ensureTextFile(join(memoryRoot, "store", "workspace.jsonl"), "");
  await ensureTextFile(join(memoryRoot, "store", "repo.jsonl"), "");
  await ensureTextFile(
    join(memoryRoot, "indexes", "semantic.index.json"),
    JSON.stringify(
      {
        version: 1,
        generated_at: new Date(0).toISOString(),
        entries: {},
      },
      null,
      2,
    ),
  );
  await ensureTextFile(join(memoryRoot, "logs", "memory-audit.jsonl"), "");
}

export async function readJsonLinesFile<T>(filePath: string, parseRow: (raw: unknown) => T): Promise<T[]> {
  try {
    const contents = await readFile(filePath, "utf8");

    return contents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseRow(JSON.parse(line)));
  } catch {
    return [];
  }
}

export async function writeJsonLinesFile<T>(filePath: string, rows: T[]) {
  await mkdir(dirname(filePath), { recursive: true });
  const contents = rows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(filePath, contents ? `${contents}\n` : "", "utf8");
}

export async function appendJsonLine<T>(filePath: string, row: T) {
  const existingRows = await readJsonLinesFile<T>(filePath, (raw) => raw as T);
  existingRows.push(row);
  await writeJsonLinesFile(filePath, existingRows);
}

export async function loadSemanticMemoryRecords(baseDir = process.cwd()) {
  await ensureMemoryLayout(baseDir);

  const files = [
    getSemanticStorePath("global", baseDir),
    getSemanticStorePath("workspace", baseDir),
    getSemanticStorePath("repo", baseDir),
  ];

  const records = await Promise.all(
    files.map((filePath) => readJsonLinesFile(filePath, (raw) => semanticMemoryRecordSchema.parse(raw))),
  );

  return records.flat();
}

export async function saveSemanticMemoryRecords(baseDir: string, records: SemanticMemoryRecord[]) {
  await ensureMemoryLayout(baseDir);

  const grouped = new Map<string, SemanticMemoryRecord[]>();

  for (const scope of ["global", "workspace", "repo"] as const) {
    grouped.set(getSemanticStorePath(scope, baseDir), []);
  }

  for (const record of records) {
    const storePath = getSemanticStorePath(record.scope, baseDir);
    const bucket = grouped.get(storePath);

    if (bucket) {
      bucket.push(record);
    }
  }

  await Promise.all(
    [...grouped.entries()].map(([filePath, rows]) => writeJsonLinesFile(filePath, rows)),
  );

  await saveSemanticIndex(baseDir, records);
}

export async function loadSemanticIndex(baseDir = process.cwd()) {
  await ensureMemoryLayout(baseDir);
  const raw = await readFile(getSemanticIndexPath(baseDir), "utf8");
  return semanticMemoryIndexSchema.parse(JSON.parse(raw)) as SemanticIndex;
}

export async function saveSemanticIndex(baseDir: string, records: SemanticMemoryRecord[]) {
  const index: SemanticIndex = {
    version: 1,
    generated_at: new Date().toISOString(),
    entries: Object.fromEntries(
      records.map((record) => [
        record.id,
        {
          id: record.id,
          scope: record.scope,
          title: record.title,
          tags: record.tags,
          retrieval_hints: record.retrieval_hints,
          status: record.status,
          store_file: STORE_FILE_BY_SCOPE[record.scope],
          updated_at: record.updated_at,
        },
      ]),
    ),
  };

  await writeFile(getSemanticIndexPath(baseDir), `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export async function appendMemoryAuditEvent(baseDir: string, event: MemoryAuditEvent) {
  memoryAuditEventSchema.parse(event);
  await appendJsonLine(getMemoryAuditLogPath(baseDir), event);
}

export async function loadMemoryAuditEvents(baseDir = process.cwd()) {
  await ensureMemoryLayout(baseDir);
  return readJsonLinesFile(getMemoryAuditLogPath(baseDir), (raw) => memoryAuditEventSchema.parse(raw));
}
