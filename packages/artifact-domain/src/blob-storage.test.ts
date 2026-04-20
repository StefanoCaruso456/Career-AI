import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s3MockState = vi.hoisted(() => ({
  objects: new Map<
    string,
    {
      body: Buffer;
      contentType: string;
      lastModified: Date;
    }
  >(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class DeleteObjectCommand {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class ListObjectsV2Command {
    input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  class S3Client {
    async send(command: {
      input: {
        Body?: Buffer | Uint8Array | string;
        Bucket: string;
        ContentType?: string;
        Key?: string;
        Prefix?: string;
      };
    }) {
      const key = command.input.Key ? `${command.input.Bucket}/${command.input.Key}` : null;

      if (command instanceof PutObjectCommand) {
        const body = command.input.Body ?? Buffer.alloc(0);
        const normalizedBody =
          typeof body === "string"
            ? Buffer.from(body)
            : Buffer.isBuffer(body)
              ? body
              : Buffer.from(body);

        s3MockState.objects.set(String(key), {
          body: normalizedBody,
          contentType: String(command.input.ContentType ?? "application/octet-stream"),
          lastModified: new Date(),
        });

        return {};
      }

      if (command instanceof GetObjectCommand) {
        const record = key ? s3MockState.objects.get(key) : null;

        if (!record) {
          const error = new Error("NoSuchKey");
          error.name = "NoSuchKey";
          throw error;
        }

        return {
          Body: {
            async transformToByteArray() {
              return Uint8Array.from(record.body);
            },
          },
        };
      }

      if (command instanceof DeleteObjectCommand) {
        if (key) {
          s3MockState.objects.delete(key);
        }

        return {};
      }

      if (command instanceof ListObjectsV2Command) {
        const prefix = `${command.input.Bucket}/${command.input.Prefix ?? ""}`;
        const contents = [...s3MockState.objects.entries()]
          .filter(([storageKey]) => storageKey.startsWith(prefix))
          .map(([storageKey, record]) => ({
            Key: storageKey.slice(`${command.input.Bucket}/`.length),
            LastModified: record.lastModified,
            Size: record.body.byteLength,
          }));

        return {
          Contents: contents,
          IsTruncated: false,
          NextContinuationToken: undefined,
        };
      }

      throw new Error("Unexpected S3 command in blob storage test.");
    }
  }

  return {
    DeleteObjectCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
  };
});

import {
  deleteBlobObject,
  getBlobStorageRoot,
  listBlobObjects,
  putBlobObject,
  readBlobObject,
} from "./blob-storage";

const blobEnvKeys = [
  "CAREER_AI_BLOB_STORAGE_ACCESS_KEY_ID",
  "CAREER_AI_BLOB_STORAGE_BUCKET",
  "CAREER_AI_BLOB_STORAGE_DRIVER",
  "CAREER_AI_BLOB_STORAGE_ENDPOINT",
  "CAREER_AI_BLOB_STORAGE_FORCE_PATH_STYLE",
  "CAREER_AI_BLOB_STORAGE_PREFIX",
  "CAREER_AI_BLOB_STORAGE_REGION",
  "CAREER_AI_BLOB_STORAGE_ROOT",
  "CAREER_AI_BLOB_STORAGE_SECRET_ACCESS_KEY",
  "CAREER_AI_BLOB_STORAGE_SESSION_TOKEN",
] as const;

describe("blob storage seam", () => {
  let blobStorageRoot = "";
  let previousEnv: Record<(typeof blobEnvKeys)[number], string | undefined>;

  beforeEach(() => {
    previousEnv = Object.fromEntries(
      blobEnvKeys.map((key) => [key, process.env[key]]),
    ) as Record<(typeof blobEnvKeys)[number], string | undefined>;
    s3MockState.objects.clear();
    blobStorageRoot = mkdtempSync(join(tmpdir(), "career-ai-blob-storage-"));
  });

  afterEach(() => {
    for (const key of blobEnvKeys) {
      const previousValue = previousEnv[key];

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }

    rmSync(blobStorageRoot, { force: true, recursive: true });
    s3MockState.objects.clear();
  });

  it("stores and reads binary objects from the filesystem fallback without exposing absolute paths", async () => {
    process.env.CAREER_AI_BLOB_STORAGE_DRIVER = "filesystem";
    process.env.CAREER_AI_BLOB_STORAGE_ROOT = blobStorageRoot;

    const storedObject = await putBlobObject({
      body: Buffer.from("artifact-bytes"),
      contentType: "text/plain",
      key: "apply-runs/apply_run_123/latest-dom.html",
    });

    expect(storedObject).toMatchObject({
      driver: "filesystem",
      key: "apply-runs/apply_run_123/latest-dom.html",
      sizeBytes: "artifact-bytes".length,
    });
    expect(getBlobStorageRoot()).toBe(blobStorageRoot);
    await expect(
      readBlobObject({
        key: storedObject.key,
      }),
    ).resolves.toEqual(Buffer.from("artifact-bytes"));
  });

  it("stores, lists, reads, and deletes objects through the shared S3-compatible driver", async () => {
    process.env.CAREER_AI_BLOB_STORAGE_DRIVER = "s3";
    process.env.CAREER_AI_BLOB_STORAGE_BUCKET = "career-ai-test";
    process.env.CAREER_AI_BLOB_STORAGE_REGION = "us-east-1";
    process.env.CAREER_AI_BLOB_STORAGE_ACCESS_KEY_ID = "test-access-key";
    process.env.CAREER_AI_BLOB_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.CAREER_AI_BLOB_STORAGE_PREFIX = "shared-artifacts";

    const storedObject = await putBlobObject({
      body: Buffer.from("shared-bytes"),
      contentType: "text/plain",
      key: "apply-runs/apply_run_987/debug.json",
    });

    expect(storedObject).toMatchObject({
      driver: "s3",
      key: "apply-runs/apply_run_987/debug.json",
      sizeBytes: "shared-bytes".length,
    });
    expect(getBlobStorageRoot()).toBe("s3://career-ai-test/shared-artifacts");
    await expect(
      readBlobObject({
        key: storedObject.key,
      }),
    ).resolves.toEqual(Buffer.from("shared-bytes"));
    await expect(
      listBlobObjects({
        prefix: "apply-runs",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        driver: "s3",
        key: "apply-runs/apply_run_987/debug.json",
        sizeBytes: "shared-bytes".length,
      }),
    ]);

    await deleteBlobObject({
      key: storedObject.key,
    });

    await expect(
      readBlobObject({
        key: storedObject.key,
      }),
    ).resolves.toBeNull();
  });
});
