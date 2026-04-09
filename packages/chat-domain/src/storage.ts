import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { chatDatabaseSchemaVersion } from "./schema";
import type { ChatDatabase } from "./schema";
import { chatDatabaseSchema } from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __careerAiChatStorageLock: Promise<unknown> | undefined;
}

export type ChatAttachmentStorage = {
  delete(storageKey: string, baseDir?: string): Promise<void>;
  read(storageKey: string, baseDir?: string): Promise<Buffer>;
  write(args: {
    baseDir?: string;
    buffer: Buffer;
    storageKey: string;
  }): Promise<void>;
};

function createEmptyDatabase(): ChatDatabase {
  return {
    attachments: [],
    conversations: [],
    messages: [],
    projects: [],
    version: chatDatabaseSchemaVersion,
  };
}

export function getChatStorageRoot(baseDir = process.cwd()) {
  return process.env.CAREER_AI_CHAT_STORAGE_ROOT?.trim() || join(baseDir, ".artifacts", "chat");
}

export function getChatManifestPath(baseDir = process.cwd()) {
  return join(getChatStorageRoot(baseDir), "state.json");
}

export function getChatFilesRoot(baseDir = process.cwd()) {
  return join(getChatStorageRoot(baseDir), "files");
}

export function getChatStoragePath(storageKey: string, baseDir = process.cwd()) {
  return join(getChatFilesRoot(baseDir), storageKey);
}

async function ensureChatStorageLayout(baseDir = process.cwd()) {
  await mkdir(getChatFilesRoot(baseDir), { recursive: true });
  await mkdir(dirname(getChatManifestPath(baseDir)), { recursive: true });

  try {
    await readFile(getChatManifestPath(baseDir), "utf8");
  } catch {
    await writeFile(
      getChatManifestPath(baseDir),
      `${JSON.stringify(createEmptyDatabase(), null, 2)}\n`,
      "utf8",
    );
  }
}

function migrateChatDatabase(raw: unknown): ChatDatabase {
  const candidate = raw as Partial<ChatDatabase> | null | undefined;

  if (candidate?.version === chatDatabaseSchemaVersion) {
    return chatDatabaseSchema.parse(candidate);
  }

  return chatDatabaseSchema.parse({
    attachments: Array.isArray(candidate?.attachments) ? candidate.attachments : [],
    conversations: Array.isArray(candidate?.conversations) ? candidate.conversations : [],
    messages: Array.isArray(candidate?.messages) ? candidate.messages : [],
    projects: Array.isArray(candidate?.projects) ? candidate.projects : [],
    version: chatDatabaseSchemaVersion,
  });
}

export async function readChatDatabase(baseDir = process.cwd()) {
  await ensureChatStorageLayout(baseDir);
  const raw = await readFile(getChatManifestPath(baseDir), "utf8");
  const parsed = migrateChatDatabase(JSON.parse(raw));

  if (parsed.version !== chatDatabaseSchemaVersion) {
    throw new Error("Unexpected chat database version.");
  }

  return parsed;
}

export async function writeChatDatabase(database: ChatDatabase, baseDir = process.cwd()) {
  await ensureChatStorageLayout(baseDir);

  const manifestPath = getChatManifestPath(baseDir);
  const temporaryPath = `${manifestPath}.tmp`;

  await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  await rename(temporaryPath, manifestPath);
}

export async function withChatStorageLock<T>(operation: () => Promise<T>) {
  const nextOperation = (globalThis.__careerAiChatStorageLock ?? Promise.resolve()).then(
    operation,
    operation,
  );

  globalThis.__careerAiChatStorageLock = nextOperation.then(
    () => undefined,
    () => undefined,
  );

  return nextOperation;
}

export const localChatAttachmentStorage: ChatAttachmentStorage = {
  async delete(storageKey, baseDir) {
    await rm(getChatStoragePath(storageKey, baseDir), { force: true });
  },

  async read(storageKey, baseDir) {
    return readFile(getChatStoragePath(storageKey, baseDir));
  },

  async write({ baseDir, buffer, storageKey }) {
    const filePath = getChatStoragePath(storageKey, baseDir);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  },
};
