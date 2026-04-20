import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

      throw new Error("Unexpected S3 command in documents test.");
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

import { persistArtifactContentObject, resetArtifactStore } from "@/packages/artifact-domain/src";
import { stageApplyRunUploadFile } from "./documents";

const envKeys = [
  "AUTONOMOUS_APPLY_ARTIFACTS_DIR",
  "CAREER_AI_ARTIFACT_STORAGE_ROOT",
  "CAREER_AI_BLOB_STORAGE_ACCESS_KEY_ID",
  "CAREER_AI_BLOB_STORAGE_BUCKET",
  "CAREER_AI_BLOB_STORAGE_DRIVER",
  "CAREER_AI_BLOB_STORAGE_PREFIX",
  "CAREER_AI_BLOB_STORAGE_REGION",
  "CAREER_AI_BLOB_STORAGE_SECRET_ACCESS_KEY",
  "CAREER_AI_USE_DURABLE_ARTIFACT_STORAGE",
] as const;

describe("apply runtime document staging", () => {
  let artifactStorageRoot = "";
  let applyArtifactsRoot = "";
  let previousEnv: Record<(typeof envKeys)[number], string | undefined>;

  beforeEach(() => {
    previousEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    ) as Record<(typeof envKeys)[number], string | undefined>;
    s3MockState.objects.clear();
    artifactStorageRoot = mkdtempSync(join(tmpdir(), "career-ai-artifact-storage-"));
    applyArtifactsRoot = mkdtempSync(join(tmpdir(), "career-ai-apply-uploads-"));
    process.env.CAREER_AI_USE_DURABLE_ARTIFACT_STORAGE = "true";
    process.env.CAREER_AI_ARTIFACT_STORAGE_ROOT = artifactStorageRoot;
    process.env.AUTONOMOUS_APPLY_ARTIFACTS_DIR = applyArtifactsRoot;
    process.env.CAREER_AI_BLOB_STORAGE_DRIVER = "s3";
    process.env.CAREER_AI_BLOB_STORAGE_BUCKET = "career-ai-test";
    process.env.CAREER_AI_BLOB_STORAGE_REGION = "us-east-1";
    process.env.CAREER_AI_BLOB_STORAGE_ACCESS_KEY_ID = "test-access-key";
    process.env.CAREER_AI_BLOB_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.CAREER_AI_BLOB_STORAGE_PREFIX = "shared-artifacts";
    resetArtifactStore({
      clearPersisted: true,
    });
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

    resetArtifactStore({
      clearPersisted: true,
    });
    s3MockState.objects.clear();
    rmSync(artifactStorageRoot, { force: true, recursive: true });
    rmSync(applyArtifactsRoot, { force: true, recursive: true });
  });

  it("stages reusable-profile resume uploads from shared blob storage when local artifact bytes are unavailable", async () => {
    const artifactId = "art_resume_shared_1";
    const resumePayload = Buffer.from("resume-payload", "utf8");

    await persistArtifactContentObject({
      artifactId,
      buffer: resumePayload,
      contentType: "application/pdf",
    });
    resetArtifactStore({
      clearPersisted: false,
    });

    const stagedPath = await stageApplyRunUploadFile({
      artifactId,
      fileName: "resume.pdf",
      runId: "apply_run_123",
    });

    expect(readFileSync(stagedPath)).toEqual(resumePayload);
  });
});
