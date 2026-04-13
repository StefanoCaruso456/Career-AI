import { z } from "zod";
import {
  verificationConfidenceTierSchema,
  verificationMethodSchema,
  verificationStatusSchema,
} from "./enums";

export const claimTypeSchema = z.enum([
  "EMPLOYMENT",
  "EDUCATION",
  "CERTIFICATION",
  "ENDORSEMENT",
]);

export const claimSchema = z.object({
  id: z.string(),
  soul_record_id: z.string(),
  claim_type: claimTypeSchema,
  title: z.string(),
  summary: z.string(),
  self_reported_payload_json: z.record(z.string(), z.unknown()),
  current_verification_record_id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const verificationRecordSchema = z.object({
  id: z.string(),
  claim_id: z.string(),
  status: verificationStatusSchema,
  confidence_tier: verificationConfidenceTierSchema,
  primary_method: verificationMethodSchema,
  source_label: z.string(),
  source_reference_optional: z.string().nullable(),
  reviewer_actor_id_optional: z.string().nullable(),
  reviewed_at_optional: z.string().datetime().nullable(),
  expires_at_optional: z.string().datetime().nullable(),
  notes_optional: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const provenanceRecordSchema = z.object({
  id: z.string(),
  verification_record_id: z.string(),
  artifact_id_optional: z.string().nullable(),
  source_actor_type: z.string(),
  source_actor_id_optional: z.string().nullable(),
  source_method: verificationMethodSchema,
  source_details_json: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime(),
});

export const employmentRecordSchema = z.object({
  id: z.string(),
  claim_id: z.string(),
  employer_name: z.string(),
  employer_domain_optional: z.string().nullable(),
  role_title: z.string(),
  employment_type_optional: z.string().nullable(),
  start_date: z.string(),
  end_date_optional: z.string().nullable(),
  currently_employed: z.boolean(),
  location_optional: z.string().nullable(),
  signatory_name_optional: z.string().nullable(),
  signatory_title_optional: z.string().nullable(),
  company_letterhead_detected_optional: z.boolean().nullable(),
  document_date_optional: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const claimDetailsDtoSchema = z.object({
  claimId: z.string(),
  claimType: z.literal("EMPLOYMENT"),
  title: z.string(),
  summary: z.string(),
  verification: verificationRecordSchema,
  employmentRecord: employmentRecordSchema,
  artifactIds: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createEmploymentClaimInputSchema = z.object({
  soulRecordId: z.string(),
  employerName: z.string().trim().min(1),
  roleTitle: z.string().trim().min(1),
  startDate: z.string().trim().min(1),
  endDate: z.string().trim().optional(),
  currentlyEmployed: z.boolean(),
  employerDomainOptional: z.string().trim().optional(),
  employmentTypeOptional: z.string().trim().optional(),
  locationOptional: z.string().trim().optional(),
  signatoryNameOptional: z.string().trim().optional(),
  signatoryTitleOptional: z.string().trim().optional(),
  companyLetterheadDetectedOptional: z.boolean().optional(),
  documentDateOptional: z.string().trim().optional(),
});

export const createVerificationRecordInputSchema = z.object({
  claimId: z.string(),
  status: verificationStatusSchema,
  confidenceTier: verificationConfidenceTierSchema,
  primaryMethod: verificationMethodSchema,
  sourceLabel: z.string().trim().min(1),
  sourceReferenceOptional: z.string().trim().optional(),
  notesOptional: z.string().trim().optional(),
});

export const verificationTransitionInputSchema = z.object({
  targetStatus: verificationStatusSchema,
  reason: z.string().trim().min(1),
  reviewerActorId: z.string().trim().min(1),
});

export const addProvenanceInputSchema = z.object({
  artifactIdOptional: z.string().optional(),
  sourceActorType: z.string().trim().min(1),
  sourceActorIdOptional: z.string().trim().optional(),
  sourceMethod: verificationMethodSchema,
  sourceDetails: z.record(z.string(), z.unknown()),
});

export type Claim = z.infer<typeof claimSchema>;
export type VerificationRecord = z.infer<typeof verificationRecordSchema>;
export type ProvenanceRecord = z.infer<typeof provenanceRecordSchema>;
export type EmploymentRecord = z.infer<typeof employmentRecordSchema>;
export type CreateEmploymentClaimInput = z.infer<typeof createEmploymentClaimInputSchema>;
export type CreateVerificationRecordInput = z.infer<typeof createVerificationRecordInputSchema>;
export type VerificationTransitionInput = z.infer<typeof verificationTransitionInputSchema>;
export type AddProvenanceInput = z.infer<typeof addProvenanceInputSchema>;
export type ClaimDetailsDto = z.infer<typeof claimDetailsDtoSchema>;
