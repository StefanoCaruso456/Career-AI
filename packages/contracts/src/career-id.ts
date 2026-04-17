import { z } from "zod";

export const trustLayerValues = [
  "self_reported",
  "relationship_backed",
  "document_backed",
  "signature_backed",
  "institution_verified",
] as const;

export const careerIdVerificationStatusValues = [
  "locked",
  "not_started",
  "in_progress",
  "verified",
  "retry_needed",
  "manual_review",
  "failed",
] as const;

export const careerIdEvidenceTypeValues = [
  "government_id",
  "selfie_liveness",
  "diploma",
  "certification",
  "transcript",
  "endorsement",
  "reference_letter",
  "signed_letter",
  "institution_check",
] as const;

export const careerIdConfidenceBandValues = ["low", "medium", "high"] as const;
export const careerIdCheckOutcomeValues = ["pass", "fail", "unknown"] as const;
export const careerIdLaunchMethodValues = ["redirect", "embedded"] as const;

export const trustLayerSchema = z.enum(trustLayerValues);
export const careerIdVerificationStatusSchema = z.enum(careerIdVerificationStatusValues);
export const careerIdEvidenceTypeSchema = z.enum(careerIdEvidenceTypeValues);
export const careerIdConfidenceBandSchema = z.enum(careerIdConfidenceBandValues);
export const careerIdCheckOutcomeSchema = z.enum(careerIdCheckOutcomeValues);
export const careerIdLaunchMethodSchema = z.enum(careerIdLaunchMethodValues);

export const governmentIdVerificationChecksSchema = z.object({
  documentAuthenticity: careerIdCheckOutcomeSchema,
  liveness: careerIdCheckOutcomeSchema,
  faceMatch: careerIdCheckOutcomeSchema,
});

export const careerIdEvidenceItemSchema = z.object({
  id: z.string(),
  type: careerIdEvidenceTypeSchema,
  provider: z.enum(["persona", "internal"]).optional(),
  providerReferenceId: z.string().optional(),
  status: careerIdVerificationStatusSchema,
  confidenceBand: careerIdConfidenceBandSchema.optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  manualReviewRequired: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const careerIdTrustPhaseSchema = z.object({
  key: trustLayerSchema,
  title: z.string(),
  description: z.string(),
  status: careerIdVerificationStatusSchema,
  completedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
  unlocked: z.boolean(),
  evidence: z.array(careerIdEvidenceItemSchema),
});

export const careerIdBadgeSchema = z.object({
  id: z.string(),
  label: z.string(),
  phase: trustLayerSchema,
  status: careerIdVerificationStatusSchema,
});

export const careerIdProfileSchema = z.object({
  userId: z.string(),
  phases: z.array(careerIdTrustPhaseSchema),
  badges: z.array(careerIdBadgeSchema),
});

export const governmentIdVerificationResultSchema = z.object({
  verificationId: z.string(),
  evidenceId: z.string().nullable().optional(),
  status: careerIdVerificationStatusSchema,
  checks: governmentIdVerificationChecksSchema,
  confidenceBand: careerIdConfidenceBandSchema.optional(),
  provider: z.literal("persona"),
  providerReferenceId: z.string().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  retryable: z.boolean().optional(),
});

export const createGovernmentIdVerificationSessionInputSchema = z.object({
  returnUrl: z.string().trim().min(1).max(500).default("/agent-build"),
  source: z.string().trim().min(1).max(120).default("career_id_page"),
});

export const governmentIdVerificationSessionSchema =
  governmentIdVerificationResultSchema.extend({
    launchMethod: careerIdLaunchMethodSchema,
    launchUrl: z.string().url(),
    expiresAt: z.string().datetime().nullable().optional(),
  });

export const careerIdDocumentVerificationStateSchema = z.object({
  evidenceId: z.string().nullable(),
  verificationId: z.string().nullable(),
  status: careerIdVerificationStatusSchema,
  unlocked: z.boolean(),
  estimatedTimeLabel: z.string(),
  explanation: z.string(),
  helperText: z.string(),
  ctaLabel: z.string().nullable(),
  retryable: z.boolean(),
  artifactLabel: z.string().nullable(),
  recoveryHints: z.array(z.string()),
  result: governmentIdVerificationResultSchema.nullable(),
});

export type TrustLayer = z.infer<typeof trustLayerSchema>;
export type CareerIdVerificationStatus = z.infer<typeof careerIdVerificationStatusSchema>;
export type CareerIdEvidenceType = z.infer<typeof careerIdEvidenceTypeSchema>;
export type CareerIdConfidenceBand = z.infer<typeof careerIdConfidenceBandSchema>;
export type CareerIdCheckOutcome = z.infer<typeof careerIdCheckOutcomeSchema>;
export type CareerIdEvidenceItem = z.infer<typeof careerIdEvidenceItemSchema>;
export type CareerIdTrustPhase = z.infer<typeof careerIdTrustPhaseSchema>;
export type CareerIdBadge = z.infer<typeof careerIdBadgeSchema>;
export type CareerIdProfile = z.infer<typeof careerIdProfileSchema>;
export type GovernmentIdVerificationResult = z.infer<
  typeof governmentIdVerificationResultSchema
>;
export type CreateGovernmentIdVerificationSessionInput = z.infer<
  typeof createGovernmentIdVerificationSessionInputSchema
>;
export type GovernmentIdVerificationSession = z.infer<
  typeof governmentIdVerificationSessionSchema
>;
export type CareerIdDocumentVerificationState = z.infer<
  typeof careerIdDocumentVerificationStateSchema
>;
