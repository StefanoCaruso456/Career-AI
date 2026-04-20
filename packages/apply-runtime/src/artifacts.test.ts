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
        return {
          Contents: [],
          IsTruncated: false,
          NextContinuationToken: undefined,
        };
      }

      throw new Error("Unexpected S3 command in apply runtime artifacts test.");
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

const persistenceMocks = vi.hoisted(() => ({
  createApplyRunArtifactRecord: vi.fn(async ({ artifact }) => ({
    ...artifact,
    createdAt: "2026-04-20T12:00:00.000Z",
    id: "apply_artifact_123",
    metadataJson: artifact.metadataJson ?? {},
  })),
}));

vi.mock("@/packages/persistence/src", () => ({
  createApplyRunArtifactRecord: persistenceMocks.createApplyRunArtifactRecord,
}));

import {
  persistApplyRunTextArtifact,
  readApplyRunArtifactContent,
} from "./artifacts";

const envKeys = [
  "CAREER_AI_BLOB_STORAGE_ACCESS_KEY_ID",
  "CAREER_AI_BLOB_STORAGE_BUCKET",
  "CAREER_AI_BLOB_STORAGE_DRIVER",
  "CAREER_AI_BLOB_STORAGE_PREFIX",
  "CAREER_AI_BLOB_STORAGE_REGION",
  "CAREER_AI_BLOB_STORAGE_SECRET_ACCESS_KEY",
] as const;

describe("apply runtime artifact storage", () => {
  let previousEnv: Record<(typeof envKeys)[number], string | undefined>;

  beforeEach(() => {
    previousEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    ) as Record<(typeof envKeys)[number], string | undefined>;
    s3MockState.objects.clear();
    vi.clearAllMocks();
    process.env.CAREER_AI_BLOB_STORAGE_DRIVER = "s3";
    process.env.CAREER_AI_BLOB_STORAGE_BUCKET = "career-ai-test";
    process.env.CAREER_AI_BLOB_STORAGE_REGION = "us-east-1";
    process.env.CAREER_AI_BLOB_STORAGE_ACCESS_KEY_ID = "test-access-key";
    process.env.CAREER_AI_BLOB_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.CAREER_AI_BLOB_STORAGE_PREFIX = "shared-artifacts";
  });

  afterEach(() => {
    for (const key of envKeys) {
      const previousValue = previousEnv[key];

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }

    s3MockState.objects.clear();
  });

  it("reads persisted apply-run artifacts back through the shared blob storage path", async () => {
    const artifact = await persistApplyRunTextArtifact({
      artifactType: "json_debug",
      content: "{\"ok\":true}",
      contentType: "application/json",
      fileName: "debug.json",
      runId: "apply_run_123",
    });

    expect(artifact.storageKey).toBe("apply-runs/apply_run_123/debug.json");
    await expect(
      readApplyRunArtifactContent({
        storageKey: artifact.storageKey,
      }),
    ).resolves.toEqual(Buffer.from("{\"ok\":true}", "utf8"));
  });
});
