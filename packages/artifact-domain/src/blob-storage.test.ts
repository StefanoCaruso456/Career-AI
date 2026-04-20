import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getBlobStorageRoot,
  putBlobObject,
  readBlobObject,
} from "./blob-storage";

describe("blob storage seam", () => {
  let blobStorageRoot = "";
  let previousBlobStorageRoot: string | undefined;

  beforeEach(() => {
    previousBlobStorageRoot = process.env.CAREER_AI_BLOB_STORAGE_ROOT;
    blobStorageRoot = mkdtempSync(join(tmpdir(), "career-ai-blob-storage-"));
    process.env.CAREER_AI_BLOB_STORAGE_ROOT = blobStorageRoot;
  });

  afterEach(() => {
    if (previousBlobStorageRoot === undefined) {
      delete process.env.CAREER_AI_BLOB_STORAGE_ROOT;
    } else {
      process.env.CAREER_AI_BLOB_STORAGE_ROOT = previousBlobStorageRoot;
    }

    rmSync(blobStorageRoot, { force: true, recursive: true });
  });

  it("stores and reads binary objects by storage key without exposing absolute paths", async () => {
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
});
