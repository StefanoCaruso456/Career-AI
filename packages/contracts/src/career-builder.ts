import { z } from "zod";

export const careerPhaseValues = [
  "self",
  "relationship",
  "document",
  "signature",
  "institution",
] as const;

export const careerEvidenceTemplateIds = [
  "idme-verification",
  "drivers-license",
  "signature-backed-documents",
  "offer-letters",
  "employment-history-reports",
  "promotion-letters",
  "company-letters",
  "hr-official-letters",
  "referrals",
  "endorsements",
  "past-colleague-letters",
  "hiring-manager-letters",
] as const;

export const careerEvidenceStatusValues = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETE",
] as const;

export const evidenceFileSlotValues = ["front", "back"] as const;

const isoDateInputSchema = z
  .string()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Dates must use YYYY-MM-DD format.",
  });

const shortText = (max: number) => z.string().trim().max(max);
const longText = (max: number) => z.string().trim().max(max);

export const careerPhaseSchema = z.enum(careerPhaseValues);
export const careerEvidenceTemplateIdSchema = z.enum(careerEvidenceTemplateIds);
export const careerEvidenceStatusSchema = z.enum(careerEvidenceStatusValues);
export const evidenceFileSlotSchema = z.enum(evidenceFileSlotValues);

export const careerProfileInputSchema = z.object({
  legalName: shortText(120),
  careerHeadline: shortText(180),
  targetRole: shortText(180),
  location: shortText(120),
  coreNarrative: longText(1200),
});

export const careerArtifactReferenceSchema = z.object({
  artifactId: z.string(),
  name: z.string(),
  sizeLabel: z.string(),
  mimeType: z.string(),
  uploadedAt: z.string().datetime(),
  slot: evidenceFileSlotSchema.optional(),
});

export const careerEvidenceInputSchema = z.object({
  templateId: careerEvidenceTemplateIdSchema,
  sourceOrIssuer: shortText(180),
  issuedOn: isoDateInputSchema,
  validationContext: longText(600),
  whyItMatters: longText(600),
  retainedArtifactIds: z.array(z.string()).default([]),
});

export const careerBuilderPhaseSaveInputSchema = z.object({
  profile: careerProfileInputSchema.optional(),
  evidence: z.array(careerEvidenceInputSchema).default([]),
});

export const careerEvidenceRecordSchema = z.object({
  id: z.string(),
  talentIdentityId: z.string(),
  soulRecordId: z.string(),
  templateId: careerEvidenceTemplateIdSchema,
  completionTier: careerPhaseSchema,
  sourceOrIssuer: z.string(),
  issuedOn: z.string(),
  validationContext: z.string(),
  whyItMatters: z.string(),
  files: z.array(careerArtifactReferenceSchema),
  status: careerEvidenceStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const careerProfileRecordSchema = z.object({
  talentIdentityId: z.string(),
  soulRecordId: z.string(),
  legalName: z.string(),
  careerHeadline: z.string(),
  targetRole: z.string(),
  location: z.string(),
  coreNarrative: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const careerPhaseProgressSchema = z.object({
  phase: careerPhaseSchema,
  label: z.string(),
  completed: z.number().int().nonnegative(),
  started: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  isComplete: z.boolean(),
  isCurrent: z.boolean(),
  summary: z.string(),
});

export const careerBuilderSnapshotSchema = z.object({
  identity: z.object({
    talentIdentityId: z.string(),
    talentAgentId: z.string(),
    soulRecordId: z.string(),
    displayName: z.string(),
    email: z.string().email(),
  }),
  profile: careerProfileRecordSchema,
  evidence: z.array(careerEvidenceRecordSchema),
  progress: z.object({
    overallProgress: z.number().int().min(0).max(100),
    completedEvidenceCount: z.number().int().nonnegative(),
    strongestTier: careerPhaseSchema,
    nextUploads: z.array(
      z.object({
        templateId: careerEvidenceTemplateIdSchema,
        title: z.string(),
      }),
    ),
  }),
  phaseProgress: z.array(careerPhaseProgressSchema),
});

export type CareerPhase = z.infer<typeof careerPhaseSchema>;
export type CareerEvidenceTemplateId = z.infer<typeof careerEvidenceTemplateIdSchema>;
export type CareerEvidenceStatus = z.infer<typeof careerEvidenceStatusSchema>;
export type EvidenceFileSlot = z.infer<typeof evidenceFileSlotSchema>;
export type CareerProfileInput = z.infer<typeof careerProfileInputSchema>;
export type CareerEvidenceInput = z.infer<typeof careerEvidenceInputSchema>;
export type CareerBuilderPhaseSaveInput = z.infer<typeof careerBuilderPhaseSaveInputSchema>;
export type CareerArtifactReference = z.infer<typeof careerArtifactReferenceSchema>;
export type CareerEvidenceRecord = z.infer<typeof careerEvidenceRecordSchema>;
export type CareerProfileRecord = z.infer<typeof careerProfileRecordSchema>;
export type CareerPhaseProgress = z.infer<typeof careerPhaseProgressSchema>;
export type CareerBuilderSnapshotDto = z.infer<typeof careerBuilderSnapshotSchema>;
