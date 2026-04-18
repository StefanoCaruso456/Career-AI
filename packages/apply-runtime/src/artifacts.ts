import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import type { Page } from "playwright";
import type { ApplyArtifactType, ApplyRunArtifactDto } from "@/packages/contracts/src";
import { getAutonomousApplyArtifactsDirectory } from "@/packages/apply-domain/src";
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
