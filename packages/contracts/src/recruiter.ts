import { z } from "zod";
import {
  verificationConfidenceTierSchema,
  verificationStatusSchema,
} from "./enums";

const emptyVisibleCategorySchema = z.array(z.record(z.string(), z.unknown()));

export const trustSummarySchema = z.object({
  id: z.string(),
  soul_record_id: z.string(),
  total_claims: z.number().int().nonnegative(),
  total_verified_claims: z.number().int().nonnegative(),
  total_reviewed_claims: z.number().int().nonnegative(),
  total_rejected_claims: z.number().int().nonnegative(),
  employment_verification_count: z.number().int().nonnegative(),
  education_verification_count: z.number().int().nonnegative(),
  certification_verification_count: z.number().int().nonnegative(),
  endorsement_count: z.number().int().nonnegative(),
  last_verified_at_optional: z.string().datetime().nullable(),
  generated_at: z.string().datetime(),
});

export const recruiterEmploymentRecordViewSchema = z.object({
  claim_id: z.string(),
  employer_name: z.string(),
  role_title: z.string(),
  start_date: z.string(),
  end_date_optional: z.string().nullable(),
  currently_employed: z.boolean(),
  verification_status_optional: verificationStatusSchema.nullable(),
  confidence_tier_optional: verificationConfidenceTierSchema.nullable(),
  source_label_optional: z.string().nullable(),
  artifact_count: z.number().int().nonnegative(),
  last_updated_at: z.string().datetime(),
});

export const recruiterTrustProfileSchema = z.object({
  id: z.string(),
  talent_identity_id: z.string(),
  public_share_token: z.string(),
  trust_summary_json: trustSummarySchema,
  visible_employment_records_json: z.array(recruiterEmploymentRecordViewSchema),
  visible_education_records_json: emptyVisibleCategorySchema,
  visible_certification_records_json: emptyVisibleCategorySchema,
  visible_endorsements_json: emptyVisibleCategorySchema,
  generated_at: z.string().datetime(),
  expires_at_optional: z.string().datetime().nullable(),
});

export const generateShareProfileInputSchema = z.object({
  talentIdentityId: z.string(),
  expiresAtOptional: z.string().datetime().optional(),
  baseUrlOptional: z.string().url().optional(),
});

export const generateShareQrInputSchema = z.object({
  baseUrlOptional: z.string().url().optional(),
});

export type TrustSummary = z.infer<typeof trustSummarySchema>;
export type RecruiterEmploymentRecordView = z.infer<
  typeof recruiterEmploymentRecordViewSchema
>;
export type RecruiterTrustProfile = z.infer<typeof recruiterTrustProfileSchema>;
export type GenerateShareProfileInput = z.infer<
  typeof generateShareProfileInputSchema
>;
export type GenerateShareQrInput = z.infer<typeof generateShareQrInputSchema>;

export type TrustSummaryDto = {
  id: string;
  totalClaims: number;
  totalVerifiedClaims: number;
  totalReviewedClaims: number;
  totalRejectedClaims: number;
  employmentVerificationCount: number;
  educationVerificationCount: number;
  certificationVerificationCount: number;
  endorsementCount: number;
  lastVerifiedAtOptional: string | null;
  generatedAt: string;
};

export type RecruiterEmploymentRecordViewDto = {
  claimId: string;
  employerName: string;
  roleTitle: string;
  startDate: string;
  endDateOptional: string | null;
  currentlyEmployed: boolean;
  verificationStatusOptional:
    | z.infer<typeof verificationStatusSchema>
    | null;
  confidenceTierOptional:
    | z.infer<typeof verificationConfidenceTierSchema>
    | null;
  sourceLabelOptional: string | null;
  artifactCount: number;
  lastUpdatedAt: string;
};

export type RecruiterTrustProfileDto = {
  id: string;
  publicShareToken: string;
  shareUrl: string;
  candidate: {
    id: string;
    talentAgentId: string;
    displayName: string;
  };
  trustSummary: TrustSummaryDto;
  visibleEmploymentRecords: RecruiterEmploymentRecordViewDto[];
  visibleEducationRecords: Record<string, unknown>[];
  visibleCertificationRecords: Record<string, unknown>[];
  visibleEndorsements: Record<string, unknown>[];
  generatedAt: string;
  expiresAtOptional: string | null;
};

export type ShareProfileQrDto = {
  profileId: string;
  qrPayload: string;
  shareUrl: string;
};
