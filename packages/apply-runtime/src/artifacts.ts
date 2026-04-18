import { promises as fs, type Dirent } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "playwright";
import type { ApplyArtifactType, ApplyRunArtifactDto } from "@/packages/contracts/src";
import {
  getAutonomousApplyArtifactsDirectory,
  getAutonomousApplyArtifactRetentionHours,
} from "@/packages/apply-domain/src";
import { createApplyRunArtifactRecord } from "@/packages/persistence/src";

async function ensureParentDirectory(path: string) {
  await fs.mkdir(dirname(path), {
    recursive: true,
  });
}

function buildArtifactPath(runId: string, fileName: string) {
  return join(getAutonomousApplyArtifactsDirectory(), runId, fileName);
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
  const absolutePath = buildArtifactPath(args.runId, fileName);

  await ensureParentDirectory(absolutePath);
  await args.page.screenshot({
    fullPage: true,
    path: absolutePath,
  });

  return createApplyRunArtifactRecord({
    artifact: {
      artifactType: args.artifactType,
      contentType: "image/png",
      metadataJson: {
        absolutePath,
        label: args.label,
      },
      runId: args.runId,
      storageKey: absolutePath,
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
  const absolutePath = buildArtifactPath(args.runId, args.fileName);

  await ensureParentDirectory(absolutePath);
  await fs.writeFile(absolutePath, args.content, "utf8");

  return createApplyRunArtifactRecord({
    artifact: {
      artifactType: args.artifactType,
      contentType: args.contentType,
      metadataJson: {
        absolutePath,
        ...(args.metadataJson ?? {}),
      },
      runId: args.runId,
      storageKey: absolutePath,
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

export async function cleanupExpiredApplyRunArtifacts(args?: {
  now?: Date;
}) {
  const rootDirectory = getAutonomousApplyArtifactsDirectory();
  const now = args?.now ?? new Date();
  const retentionMs = getAutonomousApplyArtifactRetentionHours() * 60 * 60 * 1000;
  const cutoffMs = now.getTime() - retentionMs;
  let removedRunDirectories = 0;

  let entries: Dirent[] = [];

  try {
    entries = (await fs.readdir(rootDirectory, {
      withFileTypes: true,
    })) as unknown as Dirent[];
  } catch {
    return {
      removedRunDirectories,
    };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const absolutePath = join(rootDirectory, String(entry.name));
    const stats = await fs.stat(absolutePath).catch(() => null);

    if (!stats || stats.mtimeMs >= cutoffMs) {
      continue;
    }

    await fs.rm(absolutePath, {
      force: true,
      recursive: true,
    }).catch(() => undefined);
    removedRunDirectories += 1;
  }

  return {
    removedRunDirectories,
  };
}
