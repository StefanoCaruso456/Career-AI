import type { Page } from "playwright";
import {
  deleteBlobObject,
  listBlobObjects,
  putBlobObject,
  readBlobObject,
} from "@/packages/artifact-domain/src";
import type { ApplyArtifactType, ApplyRunArtifactDto } from "@/packages/contracts/src";
import { getAutonomousApplyArtifactRetentionHours } from "@/packages/apply-domain/src";
import { createApplyRunArtifactRecord } from "@/packages/persistence/src";

function buildArtifactKey(runId: string, fileName: string) {
  return `apply-runs/${runId}/${fileName}`;
}

export async function persistApplyRunScreenshot(args: {
  artifactType: Extract<
    ApplyArtifactType,
    | "screenshot_initial"
    | "screenshot_before_submit"
    | "screenshot_after_submit"
    | "screenshot_failure"
  >;
  label: string;
  page: Page;
  runId: string;
}) {
  const fileName = `${Date.now()}-${args.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  const storageKey = buildArtifactKey(args.runId, fileName);
  const screenshot = await args.page.screenshot({
    fullPage: true,
  });
  const storedObject = await putBlobObject({
    body: Buffer.from(screenshot),
    contentType: "image/png",
    key: storageKey,
  });

  return createApplyRunArtifactRecord({
    artifact: {
      artifactType: args.artifactType,
      contentType: "image/png",
      metadataJson: {
        label: args.label,
        sizeBytes: storedObject.sizeBytes,
        storageDriver: storedObject.driver,
      },
      runId: args.runId,
      storageKey,
    },
  });
}

export async function persistApplyRunTextArtifact(args: {
  artifactType: Extract<ApplyArtifactType, "dom_snapshot" | "json_debug" | "trace_export">;
  content: string;
  contentType: string;
  fileName: string;
  metadataJson?: Record<string, unknown>;
  runId: string;
}) {
  const storageKey = buildArtifactKey(args.runId, args.fileName);
  const storedObject = await putBlobObject({
    body: Buffer.from(args.content, "utf8"),
    contentType: args.contentType,
    key: storageKey,
  });

  return createApplyRunArtifactRecord({
    artifact: {
      artifactType: args.artifactType,
      contentType: args.contentType,
      metadataJson: {
        sizeBytes: storedObject.sizeBytes,
        storageDriver: storedObject.driver,
        ...(args.metadataJson ?? {}),
      },
      runId: args.runId,
      storageKey,
    },
  });
}

export async function persistDocumentReferenceArtifact(args: {
  metadataJson: Record<string, unknown>;
  runId: string;
  storageKey: string;
}) {
  return createApplyRunArtifactRecord({
    artifact: {
      artifactType: "document_reference",
      contentType: "application/json",
      metadataJson: args.metadataJson,
      runId: args.runId,
      storageKey: args.storageKey,
    },
  });
}

export type PersistedApplyArtifact = ApplyRunArtifactDto;

export async function readApplyRunArtifactContent(args: {
  storageKey: string;
}) {
  return readBlobObject({
    key: args.storageKey,
  });
}

export async function cleanupExpiredApplyRunArtifacts(args?: {
  now?: Date;
}) {
  const now = args?.now ?? new Date();
  const retentionMs = getAutonomousApplyArtifactRetentionHours() * 60 * 60 * 1000;
  const cutoffMs = now.getTime() - retentionMs;
  let removedRunDirectories = 0;
  const runArtifacts = new Map<
    string,
    {
      hasFreshArtifact: boolean;
      storageKeys: string[];
    }
  >();
  const objects = await listBlobObjects({
    prefix: "apply-runs",
  }).catch(() => []);

  for (const object of objects) {
    const segments = object.key.split("/");

    if (segments[0] !== "apply-runs" || segments.length < 3) {
      continue;
    }

    const runPrefix = segments.slice(0, 2).join("/");
    const existingEntry = runArtifacts.get(runPrefix) ?? {
      hasFreshArtifact: false,
      storageKeys: [],
    };
    const lastModifiedMs = object.lastModified ? Date.parse(object.lastModified) : Number.NaN;

    existingEntry.storageKeys.push(object.key);

    if (!Number.isFinite(lastModifiedMs) || lastModifiedMs >= cutoffMs) {
      existingEntry.hasFreshArtifact = true;
    }

    runArtifacts.set(runPrefix, existingEntry);
  }

  for (const [, entry] of runArtifacts) {
    if (entry.hasFreshArtifact || entry.storageKeys.length === 0) {
      continue;
    }

    await Promise.all(
      entry.storageKeys.map((storageKey) =>
        deleteBlobObject({
          key: storageKey,
        }).catch(() => undefined),
      ),
    );
    removedRunDirectories += 1;
  }

  return {
    removedRunDirectories,
  };
}
