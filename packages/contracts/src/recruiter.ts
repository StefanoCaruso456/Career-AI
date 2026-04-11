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

export const employerCandidateSearchFiltersSchema = z.object({
  title: z.string().trim().max(160).optional(),
  skills: z.array(z.string().trim().min(1).max(80)).default([]),
  yearsExperienceMin: z.number().int().nonnegative().nullable().default(null),
  industry: z.string().trim().max(120).nullable().default(null),
  location: z.string().trim().max(120).nullable().default(null),
  workAuthorization: z.string().trim().max(120).nullable().default(null),
  education: z.string().trim().max(120).nullable().default(null),
  credibilityThreshold: z.number().min(0).max(1).nullable().default(null),
  verificationStatus: z.array(verificationStatusSchema).default([]),
  priorEmployers: z.array(z.string().trim().min(1).max(120)).default([]),
  certifications: z.array(z.string().trim().min(1).max(120)).default([]),
  verifiedExperienceOnly: z.boolean().default(false),
});

export const employerCandidateSearchInputModeSchema = z.enum([
  "free_text",
  "job_title",
  "job_description",
]);

export const employerCandidateSearchQuerySchema = z.object({
  prompt: z.string(),
  normalizedPrompt: z.string(),
  inputMode: employerCandidateSearchInputModeSchema,
  parsedCriteria: z.object({
    titleHints: z.array(z.string()).default([]),
    skillKeywords: z.array(z.string()).default([]),
    seniority: z.string().nullable().default(null),
    location: z.string().nullable().default(null),
    industryHints: z.array(z.string()).default([]),
    yearsExperienceMin: z.number().int().nonnegative().nullable().default(null),
    priorEmployers: z.array(z.string()).default([]),
  }),
  filters: employerCandidateSearchFiltersSchema,
});

export const employerCandidateMatchSchema = z.object({
  candidateId: z.string(),
  careerId: z.string(),
  fullName: z.string(),
  currentRole: z.string().nullable(),
  currentEmployer: z.string().nullable(),
  targetRole: z.string().nullable(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  topSkills: z.array(z.string()).default([]),
  matchReason: z.string(),
  experienceHighlights: z.array(z.string()).default([]),
  profileSummary: z.string().nullable(),
  credibility: z.object({
    label: z.string(),
    score: z.number().min(0).max(100),
    verifiedExperienceCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    verificationSignal: z.string(),
  }),
  ranking: z.object({
    label: z.string(),
    score: z.number().min(0).max(100),
  }),
  actions: z.object({
    careerIdUrl: z.string().nullable(),
    profileUrl: z.string().nullable(),
    trustProfileUrl: z.string().nullable(),
  }),
});

export const employerCandidateSearchResponseSchema = z.object({
  assistantMessage: z.string(),
  diagnostics: z.object({
    candidateCount: z.number().int().nonnegative(),
    filteredOutCount: z.number().int().nonnegative(),
    highCredibilityCount: z.number().int().nonnegative(),
    parsedSkillCount: z.number().int().nonnegative(),
    searchLatencyMs: z.number().int().nonnegative(),
  }),
  generatedAt: z.string().datetime(),
  candidates: z.array(employerCandidateMatchSchema),
  panelCount: z.number().int().nonnegative(),
  query: employerCandidateSearchQuerySchema,
  totalMatches: z.number().int().nonnegative(),
});

export const searchEmployerCandidatesInputSchema = z.object({
  conversationId: z.string().trim().min(1).nullable().optional(),
  filters: employerCandidateSearchFiltersSchema.optional(),
  limit: z.number().int().positive().max(24).optional(),
  prompt: z.string().trim().min(1),
  refresh: z.boolean().optional(),
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
export type EmployerCandidateSearchFiltersDto = z.infer<
  typeof employerCandidateSearchFiltersSchema
>;
export type EmployerCandidateSearchInputMode = z.infer<
  typeof employerCandidateSearchInputModeSchema
>;
export type EmployerCandidateSearchQueryDto = z.infer<
  typeof employerCandidateSearchQuerySchema
>;
export type EmployerCandidateMatchDto = z.infer<typeof employerCandidateMatchSchema>;
export type EmployerCandidateSearchResponseDto = z.infer<
  typeof employerCandidateSearchResponseSchema
>;
export type SearchEmployerCandidatesInput = z.infer<
  typeof searchEmployerCandidatesInputSchema
>;

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
