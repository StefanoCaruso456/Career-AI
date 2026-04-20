import { promises as fs, type Dirent } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

export type BlobStorageDriver = "filesystem" | "s3";

export type BlobStorageObject = {
  contentType: string;
  driver: BlobStorageDriver;
  key: string;
  lastModified: string | null;
  sizeBytes: number;
};

function isTruthyEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function sanitizeKeySegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

function normalizeKey(key: string) {
  return key
    .split("/")
    .map((segment) => sanitizeKeySegment(segment))
    .filter(Boolean)
    .join("/");
}

function getConfiguredBlobStoragePrefix() {
  return normalizeKey(process.env.CAREER_AI_BLOB_STORAGE_PREFIX?.trim() || "");
}

function getBlobStorageKey(key: string) {
  const normalizedKey = normalizeKey(key);
  const prefix = getConfiguredBlobStoragePrefix();

  if (!prefix) {
    return normalizedKey;
  }

  if (!normalizedKey) {
    return prefix;
  }

  return `${prefix}/${normalizedKey}`;
}

function stripBlobStoragePrefix(storageKey: string) {
  const prefix = getConfiguredBlobStoragePrefix();

  if (!prefix) {
    return normalizeKey(storageKey);
  }

  if (storageKey === prefix) {
    return "";
  }

  if (storageKey.startsWith(`${prefix}/`)) {
    return storageKey.slice(prefix.length + 1);
  }

  return normalizeKey(storageKey);
}

function getBlobStorageBucket() {
  const bucket = process.env.CAREER_AI_BLOB_STORAGE_BUCKET?.trim();

  if (!bucket) {
    throw new Error("CAREER_AI_BLOB_STORAGE_BUCKET is required for S3 blob storage.");
  }

  return bucket;
}

function getBlobStorageRegion() {
  return process.env.CAREER_AI_BLOB_STORAGE_REGION?.trim() || "us-east-1";
}

function getBlobStorageEndpoint() {
  return process.env.CAREER_AI_BLOB_STORAGE_ENDPOINT?.trim() || undefined;
}

function isBlobStoragePathStyleEnabled() {
  return isTruthyEnv(process.env.CAREER_AI_BLOB_STORAGE_FORCE_PATH_STYLE);
}

function getBlobStorageCredentials() {
  const accessKeyId = process.env.CAREER_AI_BLOB_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CAREER_AI_BLOB_STORAGE_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.CAREER_AI_BLOB_STORAGE_SESSION_TOKEN?.trim();

  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
  };
}

export function getBlobStorageDriverName(): BlobStorageDriver {
  const configuredValue = process.env.CAREER_AI_BLOB_STORAGE_DRIVER?.trim().toLowerCase();

  if (configuredValue === "s3") {
    return "s3";
  }

  if (configuredValue === "filesystem") {
    return "filesystem";
  }

  return process.env.CAREER_AI_BLOB_STORAGE_BUCKET?.trim() ? "s3" : "filesystem";
}

export function getBlobStorageRoot() {
  if (getBlobStorageDriverName() === "s3") {
    const bucket = getBlobStorageBucket();
    const prefix = getConfiguredBlobStoragePrefix();

    return prefix ? `s3://${bucket}/${prefix}` : `s3://${bucket}`;
  }

  return (
    process.env.CAREER_AI_BLOB_STORAGE_ROOT?.trim() ||
    process.env.AUTONOMOUS_APPLY_ARTIFACTS_DIR?.trim() ||
    join(tmpdir(), "career-ai-blob-storage")
  );
}

function getBlobStoragePath(key: string) {
  return join(getBlobStorageRoot(), getBlobStorageKey(key));
}

async function getS3Module() {
  return import("@aws-sdk/client-s3");
}

async function createS3Client() {
  const { S3Client } = await getS3Module();

  return new S3Client({
    credentials: getBlobStorageCredentials(),
    endpoint: getBlobStorageEndpoint(),
    forcePathStyle: isBlobStoragePathStyleEnabled(),
    region: getBlobStorageRegion(),
  });
}

function isBlobStorageNotFoundError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "NoSuchKey" || error.name === "NotFound";
}

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (body && typeof body === "object" && "transformToByteArray" in body) {
    const byteArray = await (
      body as {
        transformToByteArray: () => Promise<Uint8Array>;
      }
    ).transformToByteArray();

    return Buffer.from(byteArray);
  }

  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Buffer[] = [];

    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
        continue;
      }

      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported blob body response.");
}

async function listFilesystemObjects(rootDirectory: string, relativePrefix = ""): Promise<BlobStorageObject[]> {
  let entries: Dirent[] = [];

  try {
    entries = (await fs.readdir(rootDirectory, {
      withFileTypes: true,
    })) as unknown as Dirent[];
  } catch {
    return [];
  }

  const objects: BlobStorageObject[] = [];

  for (const entry of entries) {
    const absolutePath = join(rootDirectory, entry.name);
    const nestedRelativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      objects.push(...(await listFilesystemObjects(absolutePath, nestedRelativePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stats = await fs.stat(absolutePath).catch(() => null);

    if (!stats) {
      continue;
    }

    objects.push({
      contentType: "application/octet-stream",
      driver: "filesystem",
      key: nestedRelativePath,
      lastModified: new Date(stats.mtimeMs).toISOString(),
      sizeBytes: stats.size,
    });
  }

  return objects.filter((object) => object.key.length > 0);
}

export async function putBlobObject(args: {
  body: Buffer;
  contentType: string;
  key: string;
}) {
  if (getBlobStorageDriverName() === "filesystem") {
    const absolutePath = getBlobStoragePath(args.key);

    await fs.mkdir(dirname(absolutePath), {
      recursive: true,
    });
    await fs.writeFile(absolutePath, args.body);

    return {
      contentType: args.contentType,
      driver: "filesystem" as const,
      key: args.key,
      lastModified: new Date().toISOString(),
      sizeBytes: args.body.byteLength,
    };
  }

  const { PutObjectCommand } = await getS3Module();
  const client = await createS3Client();

  await client.send(
    new PutObjectCommand({
      Body: args.body,
      Bucket: getBlobStorageBucket(),
      ContentType: args.contentType,
      Key: getBlobStorageKey(args.key),
    }),
  );

  return {
    contentType: args.contentType,
    driver: "s3" as const,
    key: args.key,
    lastModified: new Date().toISOString(),
    sizeBytes: args.body.byteLength,
  };
}

export async function readBlobObject(args: {
  key: string;
}) {
  if (getBlobStorageDriverName() === "filesystem") {
    try {
      return await fs.readFile(getBlobStoragePath(args.key));
    } catch {
      return null;
    }
  }

  const { GetObjectCommand } = await getS3Module();
  const client = await createS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: getBlobStorageBucket(),
        Key: getBlobStorageKey(args.key),
      }),
    );

    if (!response.Body) {
      return null;
    }

    return toBuffer(response.Body);
  } catch (error) {
    if (isBlobStorageNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function deleteBlobObject(args: {
  key: string;
}) {
  if (getBlobStorageDriverName() === "filesystem") {
    await fs.rm(getBlobStoragePath(args.key), {
      force: true,
    }).catch(() => undefined);

    return;
  }

  const { DeleteObjectCommand } = await getS3Module();
  const client = await createS3Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: getBlobStorageBucket(),
      Key: getBlobStorageKey(args.key),
    }),
  );
}

export async function listBlobObjects(args?: {
  prefix?: string;
}) {
  const prefix = args?.prefix ? normalizeKey(args.prefix) : "";

  if (getBlobStorageDriverName() === "filesystem") {
    const requestedPrefix = getBlobStorageKey(prefix);
    const baseDirectory = requestedPrefix ? join(getBlobStorageRoot(), requestedPrefix) : getBlobStorageRoot();
    const filesystemObjects = await listFilesystemObjects(baseDirectory);

    return filesystemObjects
      .map((object) => ({
        ...object,
        key: stripBlobStoragePrefix(
          requestedPrefix ? `${requestedPrefix}/${object.key}`.replace(/\/+/g, "/") : object.key,
        ),
      }))
      .filter((object) => object.key.length > 0);
  }

  const { ListObjectsV2Command } = await getS3Module();
  const client = await createS3Client();
  const objects: BlobStorageObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: getBlobStorageBucket(),
        ContinuationToken: continuationToken,
        Prefix: getBlobStorageKey(prefix),
      }),
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key) {
        continue;
      }

      const key = stripBlobStoragePrefix(object.Key);

      if (!key) {
        continue;
      }

      objects.push({
        contentType: "application/octet-stream",
        driver: "s3",
        key,
        lastModified: object.LastModified?.toISOString() ?? null,
        sizeBytes: object.Size ?? 0,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}
