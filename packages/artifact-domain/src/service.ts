import { createHash } from "node:crypto";
import {
  ApiError,
  type ActorType,
  type ArtifactMetadata,
  type ArtifactUploadDto,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { getArtifactStore } from "./store";
import {
  clearPersistedArtifactStorage,
  deletePersistedArtifactRecord,
  findPersistedArtifactMetadata,
  getArtifactStorageDriverName,
  getPersistedArtifactByteLength,
  listPersistedClaimIdsForArtifact,
  persistArtifactRecord,
  persistClaimArtifactIds,
  readPersistedArtifactContent,
  readPersistedClaimArtifactIds,
} from "./storage";

function isDurableArtifactStorageEnabled() {
  const configuredValue = process.env.CAREER_AI_USE_DURABLE_ARTIFACT_STORAGE?.trim().toLowerCase();

  return configuredValue !== "0" && configuredValue !== "false";
}

function deriveArtifactType(mimeType: string, fileName: string) {
  if (mimeType.includes("pdf")) return "PDF_DOCUMENT";
  if (mimeType.startsWith("image/")) return "IMAGE_DOCUMENT";
  if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) return "WORD_DOCUMENT";
  return "DOCUMENT";
}

async function toBuffer(file: File) {
  if (typeof file.arrayBuffer === "function") {
    return Buffer.from(await file.arrayBuffer());
  }

  return Buffer.from(await new Response(file).arrayBuffer());
}

export async function uploadArtifact(args: {
  file: File;
  ownerTalentId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}): Promise<{ artifact: ArtifactMetadata; dto: ArtifactUploadDto }> {
  const store = getArtifactStore();
  const buffer = await toBuffer(args.file);
  const artifactId = `art_${crypto.randomUUID()}`;
  const uploadedAt = new Date().toISOString();
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const artifact: ArtifactMetadata = {
    artifact_id: artifactId,
    owner_talent_id: args.ownerTalentId,
    artifact_type: deriveArtifactType(args.file.type, args.file.name),
    mime_type: args.file.type || "application/octet-stream",
    original_filename: args.file.name,
    storage_uri: `artifact://local/${artifactId}/${encodeURIComponent(args.file.name)}`,
    sha256_checksum: checksum,
    uploaded_by_actor_type: args.actorType,
    uploaded_by_actor_id: args.actorId,
    source_type: "USER_UPLOAD",
    source_label: args.file.name,
    uploaded_at: uploadedAt,
    parsing_status: "QUEUED",
    retention_policy: "STANDARD",
    redaction_status: "NOT_REDACTED",
  };

  store.artifactsById.set(artifactId, artifact);
  store.contentsById.set(artifactId, buffer);

  if (isDurableArtifactStorageEnabled()) {
    persistArtifactRecord({
      artifact,
      buffer,
    });
  }

  logAuditEvent({
    eventType: "artifact.uploaded",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "artifact",
    targetId: artifactId,
    correlationId: args.correlationId,
    metadataJson: {
      mime_type: artifact.mime_type,
      original_filename: artifact.original_filename,
      owner_talent_id: artifact.owner_talent_id,
    },
  });

  logAuditEvent({
    eventType: "artifact.parsing.requested",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "artifact",
    targetId: artifactId,
    correlationId: args.correlationId,
    metadataJson: {
      parsing_status: artifact.parsing_status,
    },
  });

  return {
    artifact,
    dto: {
      artifactId,
      mimeType: artifact.mime_type,
      parsingStatus: artifact.parsing_status,
    },
  };
}

export function getArtifactMetadata(args: {
  actorId?: string;
  actorType?: ActorType;
  artifactId: string;
  correlationId: string;
}): ArtifactMetadata {
  const store = getArtifactStore();
  let artifact = store.artifactsById.get(args.artifactId) ?? null;

  if (!artifact) {
    artifact = isDurableArtifactStorageEnabled()
      ? findPersistedArtifactMetadata({
          artifactId: args.artifactId,
        })
      : null;

    if (artifact) {
      store.artifactsById.set(args.artifactId, artifact);
    }
  }

  if (!artifact) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Artifact was not found.",
      details: { artifactId: args.artifactId },
      correlationId: args.correlationId,
    });
  }

  if (args.actorType && args.actorId) {
    logAuditEvent({
      eventType: "artifact.metadata.read",
      actorType: args.actorType,
      actorId: args.actorId,
      targetType: "artifact",
      targetId: artifact.artifact_id,
      correlationId: args.correlationId,
      metadataJson: {
        owner_talent_id: artifact.owner_talent_id,
      },
    });
  }

  return artifact;
}

export function attachArtifactToClaim(args: {
  claimId: string;
  artifactId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const store = getArtifactStore();
  const artifact = getArtifactMetadata({
    artifactId: args.artifactId,
    correlationId: args.correlationId,
  });

  const existingArtifactIds = store.artifactIdsByClaimId.get(args.claimId) ?? [];
  const persistedArtifactIds =
    existingArtifactIds.length > 0
      ? existingArtifactIds
      : isDurableArtifactStorageEnabled()
        ? readPersistedClaimArtifactIds({
            claimId: args.claimId,
          })
        : [];
  const nextArtifactIds = persistedArtifactIds.includes(args.artifactId)
    ? persistedArtifactIds
    : [...persistedArtifactIds, args.artifactId];

  store.artifactIdsByClaimId.set(args.claimId, nextArtifactIds);

  if (isDurableArtifactStorageEnabled()) {
    persistClaimArtifactIds({
      artifactIds: nextArtifactIds,
      claimId: args.claimId,
    });
  }

  logAuditEvent({
    eventType: "artifact.attached_to_claim",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "claim",
    targetId: args.claimId,
    correlationId: args.correlationId,
    metadataJson: {
      artifact_id: artifact.artifact_id,
    },
  });

  return artifact;
}

export function listArtifactsForClaim(claimId: string) {
  const store = getArtifactStore();
  const cachedArtifactIds = store.artifactIdsByClaimId.get(claimId);

  if (cachedArtifactIds) {
    return [...cachedArtifactIds];
  }

  const persistedArtifactIds = isDurableArtifactStorageEnabled()
    ? readPersistedClaimArtifactIds({
        claimId,
      })
    : [];
  store.artifactIdsByClaimId.set(claimId, persistedArtifactIds);
  return persistedArtifactIds;
}

export function getArtifactContentByteLength(args: {
  artifactId: string;
}) {
  const cachedContent = getArtifactStore().contentsById.get(args.artifactId);

  if (cachedContent) {
    return cachedContent.byteLength;
  }

  if (!isDurableArtifactStorageEnabled()) {
    return 0;
  }

  return getPersistedArtifactByteLength(args);
}

export function readArtifactContent(args: {
  artifactId: string;
  correlationId: string;
}) {
  const cachedContent = getArtifactStore().contentsById.get(args.artifactId);

  if (cachedContent) {
    return cachedContent;
  }

  const artifact = getArtifactMetadata({
    artifactId: args.artifactId,
    correlationId: args.correlationId,
  });

  if (!isDurableArtifactStorageEnabled()) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        artifactId: args.artifactId,
        ownerTalentId: artifact.owner_talent_id,
      },
      errorCode: "DEPENDENCY_FAILURE",
      message: "Artifact content is not available in memory and durable storage is disabled.",
      status: 503,
    });
  }

  const persistedContent = readPersistedArtifactContent({
    artifactId: args.artifactId,
  });

  if (!persistedContent) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        artifactId: args.artifactId,
      },
      errorCode: "NOT_FOUND",
      message: "Artifact content was not found.",
      status: 404,
    });
  }

  getArtifactStore().contentsById.set(args.artifactId, persistedContent);

  return persistedContent;
}

export function deleteArtifact(args: {
  actorId: string;
  actorType: ActorType;
  artifactId: string;
  correlationId: string;
}) {
  const artifact = getArtifactMetadata({
    artifactId: args.artifactId,
    correlationId: args.correlationId,
  });
  const store = getArtifactStore();
  const linkedClaimIds = new Set<string>();

  for (const [claimId, artifactIds] of store.artifactIdsByClaimId.entries()) {
    if (artifactIds.includes(args.artifactId)) {
      linkedClaimIds.add(claimId);
    }
  }

  if (isDurableArtifactStorageEnabled()) {
    for (const claimId of listPersistedClaimIdsForArtifact({
      artifactId: args.artifactId,
    })) {
      linkedClaimIds.add(claimId);
    }
  }

  if (linkedClaimIds.size > 0) {
    logAuditEvent({
      eventType: "artifact.delete.denied",
      actorType: args.actorType,
      actorId: args.actorId,
      targetType: "artifact",
      targetId: args.artifactId,
      correlationId: args.correlationId,
      metadataJson: {
        claim_ids: [...linkedClaimIds],
        owner_talent_id: artifact.owner_talent_id,
        reason: "artifact_attached_to_claim",
      },
    });

    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Artifacts attached to claims cannot be deleted.",
      details: {
        artifactId: args.artifactId,
        claimIds: [...linkedClaimIds],
      },
      correlationId: args.correlationId,
    });
  }

  store.artifactsById.delete(args.artifactId);
  store.contentsById.delete(args.artifactId);

  for (const [claimId, artifactIds] of store.artifactIdsByClaimId.entries()) {
    store.artifactIdsByClaimId.set(
      claimId,
      artifactIds.filter((artifactId) => artifactId !== args.artifactId),
    );
  }

  if (isDurableArtifactStorageEnabled()) {
    deletePersistedArtifactRecord({
      artifactId: args.artifactId,
    });
  }

  logAuditEvent({
    eventType: "artifact.deleted",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "artifact",
    targetId: args.artifactId,
    correlationId: args.correlationId,
    metadataJson: {
      owner_talent_id: artifact.owner_talent_id,
    },
  });

  return artifact;
}

export function getArtifactServiceMetrics() {
  const store = getArtifactStore();

  return {
    artifacts: store.artifactsById.size,
    linkedClaims: store.artifactIdsByClaimId.size,
    storageDriver: getArtifactStorageDriverName(),
  };
}

export function resetArtifactStore(options?: {
  clearPersisted?: boolean;
}) {
  const shouldClearPersisted =
    typeof options?.clearPersisted === "boolean"
      ? options.clearPersisted
      : process.env.NODE_ENV === "test";

  globalThis.__taidArtifactStore = {
    artifactIdsByClaimId: new Map(),
    artifactsById: new Map(),
    contentsById: new Map(),
  };

  if (shouldClearPersisted) {
    clearPersistedArtifactStorage();
  }
}
