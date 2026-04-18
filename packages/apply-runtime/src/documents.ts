import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import { readArtifactContent } from "@/packages/artifact-domain/src";
import { getAutonomousApplyArtifactsDirectory } from "@/packages/apply-domain/src";

function sanitizeFileName(fileName: string) {
  const trimmed = basename(fileName).trim();

  if (!trimmed) {
    return "document.bin";
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export async function stageApplyRunUploadFile(args: {
  artifactId: string;
  fileName: string;
  runId: string;
}) {
  const safeFileName = sanitizeFileName(args.fileName);
  const absolutePath = join(
    getAutonomousApplyArtifactsDirectory(),
    args.runId,
    "uploads",
    `${args.artifactId}-${safeFileName}`,
  );

  await fs.mkdir(join(getAutonomousApplyArtifactsDirectory(), args.runId, "uploads"), {
    recursive: true,
  });

  try {
    await fs.access(absolutePath);
    return absolutePath;
  } catch {
    const buffer = readArtifactContent({
      artifactId: args.artifactId,
      correlationId: `apply-run-upload:${args.runId}:${args.artifactId}`,
    });

    await fs.writeFile(absolutePath, buffer);

    return absolutePath;
  }
}
