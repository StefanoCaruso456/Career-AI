import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { artifactMetadataSchema, type ArtifactMetadata } from "@/packages/contracts/src";

const artifactDatabaseSchemaVersion = 1;
const artifactDatabaseSchema = z.object({
  artifacts: z.array(artifactMetadataSchema).default([]),
  claimArtifactIds: z.record(z.string(), z.array(z.string())).default({}),
  version: z.literal(artifactDatabaseSchemaVersion),
});

type ArtifactDatabase = z.infer<typeof artifactDatabaseSchema>;

function createEmptyArtifactDatabase(): ArtifactDatabase {
  return {
    artifacts: [],
    claimArtifactIds: {},
    version: artifactDatabaseSchemaVersion,
  };
}

export function getArtifactStorageRoot(baseDir = process.cwd()) {
  return process.env.CAREER_AI_ARTIFACT_STORAGE_ROOT?.trim() || join(baseDir, ".artifacts", "artifacts");
}

function getArtifactManifestPath(baseDir = process.cwd()) {
  return join(getArtifactStorageRoot(baseDir), "state.json");
}

function getArtifactFilesRoot(baseDir = process.cwd()) {
  return join(getArtifactStorageRoot(baseDir), "files");
}

function getArtifactFilePath(artifactId: string, baseDir = process.cwd()) {
  return join(getArtifactFilesRoot(baseDir), artifactId);
}

function ensureArtifactStorageLayout(baseDir = process.cwd()) {
  mkdirSync(getArtifactFilesRoot(baseDir), { recursive: true });
  mkdirSync(dirname(getArtifactManifestPath(baseDir)), { recursive: true });

  if (!existsSync(getArtifactManifestPath(baseDir))) {
    writeFileSync(
      getArtifactManifestPath(baseDir),
      `${JSON.stringify(createEmptyArtifactDatabase(), null, 2)}\n`,
      "utf8",
    );
  }
}

function readArtifactDatabase(baseDir = process.cwd()) {
  ensureArtifactStorageLayout(baseDir);
  const raw = readFileSync(getArtifactManifestPath(baseDir), "utf8");
  const parsed = JSON.parse(raw) as Partial<ArtifactDatabase>;

  return artifactDatabaseSchema.parse({
    artifacts: Array.isArray(parsed?.artifacts) ? parsed.artifacts : [],
    claimArtifactIds:
      parsed?.claimArtifactIds && typeof parsed.claimArtifactIds === "object"
        ? parsed.claimArtifactIds
        : {},
    version: artifactDatabaseSchemaVersion,
  });
}

function writeArtifactDatabase(database: ArtifactDatabase, baseDir = process.cwd()) {
  ensureArtifactStorageLayout(baseDir);
  const manifestPath = getArtifactManifestPath(baseDir);
  const temporaryPath = `${manifestPath}.tmp`;

  writeFileSync(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, manifestPath);
}

export function persistArtifactRecord(args: {
  artifact: ArtifactMetadata;
  baseDir?: string;
  buffer: Buffer;
}) {
  const database = readArtifactDatabase(args.baseDir);
  const nextArtifacts = database.artifacts.filter(
    (artifact) => artifact.artifact_id !== args.artifact.artifact_id,
  );

  nextArtifacts.push(args.artifact);
  writeFileSync(getArtifactFilePath(args.artifact.artifact_id, args.baseDir), args.buffer);
  writeArtifactDatabase(
    {
      ...database,
      artifacts: nextArtifacts,
    },
    args.baseDir,
  );
}

export function findPersistedArtifactMetadata(args: {
  artifactId: string;
  baseDir?: string;
}) {
  return (
    readArtifactDatabase(args.baseDir).artifacts.find(
      (artifact) => artifact.artifact_id === args.artifactId,
    ) ?? null
  );
}

export function persistClaimArtifactIds(args: {
  artifactIds: string[];
  baseDir?: string;
  claimId: string;
}) {
  const database = readArtifactDatabase(args.baseDir);

  writeArtifactDatabase(
    {
      ...database,
      claimArtifactIds: {
        ...database.claimArtifactIds,
        [args.claimId]: args.artifactIds,
      },
    },
    args.baseDir,
  );
}

export function readPersistedClaimArtifactIds(args: {
  baseDir?: string;
  claimId: string;
}) {
  return [...(readArtifactDatabase(args.baseDir).claimArtifactIds[args.claimId] ?? [])];
}

export function deletePersistedArtifactRecord(args: {
  artifactId: string;
  baseDir?: string;
}) {
  const database = readArtifactDatabase(args.baseDir);

  rmSync(getArtifactFilePath(args.artifactId, args.baseDir), {
    force: true,
  });

  const nextClaimArtifactIds = Object.fromEntries(
    Object.entries(database.claimArtifactIds).map(([claimId, artifactIds]) => [
      claimId,
      artifactIds.filter((artifactId) => artifactId !== args.artifactId),
    ]),
  );

  writeArtifactDatabase(
    {
      ...database,
      artifacts: database.artifacts.filter((artifact) => artifact.artifact_id !== args.artifactId),
      claimArtifactIds: nextClaimArtifactIds,
    },
    args.baseDir,
  );
}

export function getPersistedArtifactByteLength(args: {
  artifactId: string;
  baseDir?: string;
}) {
  try {
    return statSync(getArtifactFilePath(args.artifactId, args.baseDir)).size;
  } catch {
    return 0;
  }
}

export function clearPersistedArtifactStorage(baseDir = process.cwd()) {
  rmSync(getArtifactStorageRoot(baseDir), { force: true, recursive: true });
}
