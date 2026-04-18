import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
type ArtifactStorageDriver = "filesystem";

export type ArtifactPersistenceAdapter = {
  clearStorage(baseDir?: string): void;
  deleteRecord(args: {
    artifactId: string;
    baseDir?: string;
  }): void;
  driver: ArtifactStorageDriver;
  findMetadata(args: {
    artifactId: string;
    baseDir?: string;
  }): ArtifactMetadata | null;
  getByteLength(args: {
    artifactId: string;
    baseDir?: string;
  }): number;
  listClaimIdsForArtifact(args: {
    artifactId: string;
    baseDir?: string;
  }): string[];
  persistClaimArtifactIds(args: {
    artifactIds: string[];
    baseDir?: string;
    claimId: string;
  }): void;
  persistRecord(args: {
    artifact: ArtifactMetadata;
    baseDir?: string;
    buffer: Buffer;
  }): void;
  readContent(args: {
    artifactId: string;
    baseDir?: string;
  }): Buffer | null;
  readClaimArtifactIds(args: {
    baseDir?: string;
    claimId: string;
  }): string[];
};

function createEmptyArtifactDatabase(): ArtifactDatabase {
  return {
    artifacts: [],
    claimArtifactIds: {},
    version: artifactDatabaseSchemaVersion,
  };
}

export function getArtifactStorageRoot(baseDir = process.cwd()) {
  const configuredRoot = process.env.CAREER_AI_ARTIFACT_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    return configuredRoot;
  }

  if (process.env.NODE_ENV === "test") {
    const workerSuffix =
      process.env.VITEST_WORKER_ID?.trim() ||
      process.env.VITEST_POOL_ID?.trim() ||
      String(process.pid);

    return join(baseDir, ".artifacts", `artifacts-${workerSuffix}`);
  }

  return join(baseDir, ".artifacts", "artifacts");
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

const filesystemArtifactPersistenceAdapter: ArtifactPersistenceAdapter = {
  clearStorage(baseDir = process.cwd()) {
    rmSync(getArtifactStorageRoot(baseDir), { force: true, recursive: true });
  },
  deleteRecord(args) {
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
  },
  driver: "filesystem",
  findMetadata(args) {
    const artifact =
      readArtifactDatabase(args.baseDir).artifacts.find(
        (candidate) => candidate.artifact_id === args.artifactId,
      ) ?? null;

    if (!artifact) {
      return null;
    }

    if (!existsSync(getArtifactFilePath(args.artifactId, args.baseDir))) {
      return null;
    }

    return artifact;
  },
  getByteLength(args) {
    try {
      return statSync(getArtifactFilePath(args.artifactId, args.baseDir)).size;
    } catch {
      return 0;
    }
  },
  listClaimIdsForArtifact(args) {
    const database = readArtifactDatabase(args.baseDir);

    return Object.entries(database.claimArtifactIds)
      .filter(([, artifactIds]) => artifactIds.includes(args.artifactId))
      .map(([claimId]) => claimId);
  },
  persistClaimArtifactIds(args) {
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
  },
  persistRecord(args) {
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
  },
  readContent(args) {
    try {
      return readFileSync(getArtifactFilePath(args.artifactId, args.baseDir));
    } catch {
      return null;
    }
  },
  readClaimArtifactIds(args) {
    return [...(readArtifactDatabase(args.baseDir).claimArtifactIds[args.claimId] ?? [])];
  },
};

function getArtifactPersistenceAdapter(): ArtifactPersistenceAdapter {
  return filesystemArtifactPersistenceAdapter;
}

export function getArtifactStorageDriverName() {
  return getArtifactPersistenceAdapter().driver;
}

export function persistArtifactRecord(args: {
  artifact: ArtifactMetadata;
  baseDir?: string;
  buffer: Buffer;
}) {
  getArtifactPersistenceAdapter().persistRecord(args);
}

export function findPersistedArtifactMetadata(args: {
  artifactId: string;
  baseDir?: string;
}) {
  return getArtifactPersistenceAdapter().findMetadata(args);
}

export function persistClaimArtifactIds(args: {
  artifactIds: string[];
  baseDir?: string;
  claimId: string;
}) {
  getArtifactPersistenceAdapter().persistClaimArtifactIds(args);
}

export function readPersistedClaimArtifactIds(args: {
  baseDir?: string;
  claimId: string;
}) {
  return getArtifactPersistenceAdapter().readClaimArtifactIds(args);
}

export function listPersistedClaimIdsForArtifact(args: {
  artifactId: string;
  baseDir?: string;
}) {
  return getArtifactPersistenceAdapter().listClaimIdsForArtifact(args);
}

export function deletePersistedArtifactRecord(args: {
  artifactId: string;
  baseDir?: string;
}) {
  getArtifactPersistenceAdapter().deleteRecord(args);
}

export function getPersistedArtifactByteLength(args: {
  artifactId: string;
  baseDir?: string;
}) {
  return getArtifactPersistenceAdapter().getByteLength(args);
}

export function readPersistedArtifactContent(args: {
  artifactId: string;
  baseDir?: string;
}) {
  return getArtifactPersistenceAdapter().readContent(args);
}

export function clearPersistedArtifactStorage(baseDir = process.cwd()) {
  getArtifactPersistenceAdapter().clearStorage(baseDir);
}
