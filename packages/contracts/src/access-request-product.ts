import { z } from "zod";
import {
  accessRequestStatusSchema,
  accessScopeSchema,
} from "./access-control";

export const accessRequestDeliveryChannelSchema = z.enum(["in_app", "email", "sms"]);

export const candidateNotificationPreferencesSchema = z.object({
  accessRequestEmailEnabled: z.boolean(),
  accessRequestSmsEnabled: z.boolean(),
  phoneNumberConfigured: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
});

export const updateCandidateNotificationPreferencesInputSchema = z.object({
  accessRequestSmsEnabled: z.boolean(),
});

const accessRequestRequesterSummarySchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  requesterName: z.string(),
  requesterUserId: z.string(),
});

const accessRequestSubjectSummarySchema = z.object({
  talentIdentityId: z.string(),
  displayName: z.string(),
});

export const accessRequestSummaryDtoSchema = z.object({
  createdAt: z.string().datetime(),
  grantedAt: z.string().datetime().nullable(),
  id: z.string(),
  justification: z.string(),
  rejectedAt: z.string().datetime().nullable(),
  requestedDurationDaysOptional: z.number().int().positive().nullable(),
  reviewPath: z.string(),
  scope: accessScopeSchema,
  status: accessRequestStatusSchema,
  subject: accessRequestSubjectSummarySchema,
  requester: accessRequestRequesterSummarySchema,
  updatedAt: z.string().datetime(),
});

export const accessRequestListResponseDtoSchema = z.object({
  items: z.array(accessRequestSummaryDtoSchema),
});

export const accessRequestReviewDtoSchema = accessRequestSummaryDtoSchema.extend({
  grantedExpiresAtOptional: z.string().datetime().nullable(),
  reviewAccess: z.object({
    channel: z.enum(["session_owner", "email", "sms"]),
    tokenValidated: z.boolean(),
  }),
});

const privateEmploymentRecordSchema = z.object({
  artifactCount: z.number().int().nonnegative(),
  claimId: z.string(),
  confidenceTierOptional: z.string().nullable(),
  currentlyEmployed: z.boolean(),
  employerName: z.string(),
  endDateOptional: z.string().nullable(),
  lastUpdatedAt: z.string().datetime(),
  roleTitle: z.string(),
  sourceLabelOptional: z.string().nullable(),
  startDate: z.string(),
  verificationStatusOptional: z.string().nullable(),
});

const privateEvidenceRecordSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  id: z.string(),
  issuedOn: z.string(),
  sourceOrIssuer: z.string().nullable(),
  status: z.string(),
  templateId: z.string(),
  whyItMatters: z.string(),
});

export const recruiterPrivateCandidateProfileDtoSchema = z.object({
  access: z.object({
    granted: z.boolean(),
    grantedExpiresAtOptional: z.string().datetime().nullable(),
    lastRequestStatusOptional: accessRequestStatusSchema.nullable(),
    scope: accessScopeSchema,
  }),
  candidate: z.object({
    careerId: z.string(),
    displayName: z.string(),
    legalName: z.string().nullable(),
  }),
  evidenceRecords: z.array(privateEvidenceRecordSchema),
  employmentRecords: z.array(privateEmploymentRecordSchema),
  profile: z.object({
    careerHeadline: z.string().nullable(),
    coreNarrative: z.string().nullable(),
    location: z.string().nullable(),
    targetRole: z.string().nullable(),
  }),
});

export type AccessRequestDeliveryChannel = z.infer<typeof accessRequestDeliveryChannelSchema>;
export type CandidateNotificationPreferences = z.infer<
  typeof candidateNotificationPreferencesSchema
>;
export type UpdateCandidateNotificationPreferencesInput = z.infer<
  typeof updateCandidateNotificationPreferencesInputSchema
>;
export type AccessRequestSummaryDto = z.infer<typeof accessRequestSummaryDtoSchema>;
export type AccessRequestListResponseDto = z.infer<typeof accessRequestListResponseDtoSchema>;
export type AccessRequestReviewDto = z.infer<typeof accessRequestReviewDtoSchema>;
export type RecruiterPrivateCandidateProfileDto = z.infer<
  typeof recruiterPrivateCandidateProfileDtoSchema
>;
