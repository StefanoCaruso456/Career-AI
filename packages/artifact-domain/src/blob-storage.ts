import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

export type BlobStorageDriver = "filesystem";

function sanitizeKeySegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

export function getBlobStorageRoot() {
  return (
    process.env.CAREER_AI_BLOB_STORAGE_ROOT?.trim() ||
    process.env.AUTONOMOUS_APPLY_ARTIFACTS_DIR?.trim() ||
    join(tmpdir(), "career-ai-blob-storage")
  );
}

function getBlobStoragePath(key: string) {
  const sanitizedKey = key
    .split("/")
    .map((segment) => sanitizeKeySegment(segment))
    .filter(Boolean)
    .join("/");

  return join(getBlobStorageRoot(), sanitizedKey);
}

export async function putBlobObject(args: {
  body: Buffer;
  contentType: string;
  key: string;
}) {
  const absolutePath = getBlobStoragePath(args.key);

  await fs.mkdir(dirname(absolutePath), {
    recursive: true,
  });
  await fs.writeFile(absolutePath, args.body);

  return {
    contentType: args.contentType,
    driver: "filesystem" as const,
    key: args.key,
    sizeBytes: args.body.byteLength,
  };
}

export async function readBlobObject(args: {
  key: string;
}) {
  try {
    return await fs.readFile(getBlobStoragePath(args.key));
  } catch {
    return null;
  }
}
