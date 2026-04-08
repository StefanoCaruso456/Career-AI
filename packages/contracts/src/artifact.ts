import { z } from "zod";
import { actorTypeSchema } from "./enums";

export const artifactParsingStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

export const artifactMetadataSchema = z.object({
  artifact_id: z.string(),
  owner_talent_id: z.string(),
  artifact_type: z.string(),
  mime_type: z.string(),
  original_filename: z.string(),
  storage_uri: z.string(),
  sha256_checksum: z.string(),
  uploaded_by_actor_type: actorTypeSchema,
  uploaded_by_actor_id: z.string(),
  source_type: z.string(),
  source_label: z.string(),
  uploaded_at: z.string().datetime(),
  parsing_status: artifactParsingStatusSchema,
  retention_policy: z.string(),
  redaction_status: z.string(),
});

export const attachArtifactToClaimInputSchema = z.object({
  artifactId: z.string(),
});

export type ArtifactParsingStatus = z.infer<typeof artifactParsingStatusSchema>;
export type ArtifactMetadata = z.infer<typeof artifactMetadataSchema>;
export type AttachArtifactToClaimInput = z.infer<typeof attachArtifactToClaimInputSchema>;

export type ArtifactUploadDto = {
  artifactId: string;
  mimeType: string;
  parsingStatus: ArtifactParsingStatus;
};
