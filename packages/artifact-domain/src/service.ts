import { createHash } from "node:crypto";
import {
  ApiError,
  type ActorType,
  type ArtifactMetadata,
  type ArtifactUploadDto,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { getArtifactStore } from "./store";

function deriveArtifactType(mimeType: string, fileName: string) {
  if (mimeType.includes("pdf")) return "PDF_DOCUMENT";
  if (mimeType.startsWith("image/")) return "IMAGE_DOCUMENT";
  if (fileName.endsWith(".doc") || fileName.endsWith(".docx")) return "WORD_DOCUMENT";
  return "DOCUMENT";
}

export async function uploadArtifact(args: {
  file: File;
  ownerTalentId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}): Promise<{ artifact: ArtifactMetadata; dto: ArtifactUploadDto }> {
  const store = getArtifactStore();
  const buffer = Buffer.from(await args.file.arrayBuffer());
  const artifactId = `art_${crypto.randomUUID()}`;
  const uploadedAt = new Date().toISOString();
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const artifact: ArtifactMetadata = {
    artifact_id: artifactId,
    owner_talent_id: args.ownerTalentId,
    artifact_type: deriveArtifactType(args.file.type, args.file.name),
    mime_type: args.file.type || "application/octet-stream",
    original_filename: args.file.name,
    storage_uri: `memory://${artifactId}/${encodeURIComponent(args.file.name)}`,
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
  artifactId: string;
  correlationId: string;
}): ArtifactMetadata {
  const artifact = getArtifactStore().artifactsById.get(args.artifactId);

  if (!artifact) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Artifact was not found.",
      details: { artifactId: args.artifactId },
      correlationId: args.correlationId,
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

  if (!existingArtifactIds.includes(args.artifactId)) {
    store.artifactIdsByClaimId.set(args.claimId, [...existingArtifactIds, args.artifactId]);
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
  return [...(getArtifactStore().artifactIdsByClaimId.get(claimId) ?? [])];
}

export function getArtifactServiceMetrics() {
  const store = getArtifactStore();

  return {
    artifacts: store.artifactsById.size,
    linkedClaims: store.artifactIdsByClaimId.size,
  };
}
