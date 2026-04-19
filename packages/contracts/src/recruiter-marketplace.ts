import { z } from "zod";
import { actorTypeSchema } from "./enums";

export const employerPartnerStatusSchema = z.enum(["active", "inactive"]);

export const recruiterCareerIdentityStatusSchema = z.enum([
  "active",
  "inactive",
  "archived",
]);

export const recruiterCareerIdentityVisibilitySchema = z.enum([
  "public_directory",
  "private_directory",
]);

export const recruiterOwnedJobStatusSchema = z.enum(["open", "on_hold", "closed"]);

export const recruiterOwnedJobVisibilitySchema = z.enum([
  "discoverable",
  "restricted",
]);

export const recruiterAccessGrantStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "revoked",
]);

export const recruiterConversationStatusSchema = z.enum(["active", "closed"]);

export const recruiterConversationMessageRoleSchema = z.enum([
  "job_seeker",
  "recruiter_agent",
  "system",
]);

export const recruiterJobPermissionScopeSchema = z.enum([
  "view_jobs",
  "chat_about_jobs",
  "match_against_my_career_id",
  "request_review",
]);

export const recruiterRetrievalModeSchema = z.enum([
  "recruiter_jobs",
  "recruiter_match",
  "recruiter_review",
]);

export const syntheticDataSeedRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
]);

export const recruiterA2AMessageTypeSchema = z.enum([
  "recruiter_access_request",
  "recruiter_access_approved",
  "recruiter_access_denied",
  "recruiter_fit_evaluation_request",
  "seeker_authorized_career_id_share",
  "recruiter_recommendation_response",
  "recruiter_review_request",
  "recruiter_conversation_follow_up",
]);

export const employerPartnerSchema = z.object({
  id: z.string(),
  slug: z.string(),
  displayName: z.string(),
  legalNameOptional: z.string().nullable().default(null),
  websiteUrlOptional: z.string().url().nullable().default(null),
  logoUrlOptional: z.string().url().nullable().default(null),
  status: employerPartnerStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const recruiterCareerIdentitySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  employerPartnerId: z.string(),
  displayName: z.string(),
  recruiterRoleTitle: z.string(),
  bio: z.string(),
  companyName: z.string(),
  status: recruiterCareerIdentityStatusSchema,
  visibility: recruiterCareerIdentityVisibilitySchema,
  isSynthetic: z.boolean(),
  avatarUrlOptional: z.string().url().nullable().default(null),
  ownershipScopeJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const recruiterOwnedJobSchema = z.object({
  id: z.string(),
  recruiterCareerIdentityId: z.string(),
  employerPartnerId: z.string(),
  title: z.string(),
  location: z.string().nullable().default(null),
  department: z.string().nullable().default(null),
  employmentType: z.string().nullable().default(null),
  seniority: z.string().nullable().default(null),
  compensationMin: z.number().nonnegative().nullable().default(null),
  compensationMax: z.number().nonnegative().nullable().default(null),
  compensationCurrency: z.string().nullable().default(null),
  description: z.string(),
  responsibilities: z.array(z.string()).default([]),
  qualifications: z.array(z.string()).default([]),
  preferredQualifications: z.array(z.string()).default([]),
  status: recruiterOwnedJobStatusSchema,
  visibility: recruiterOwnedJobVisibilitySchema,
  searchableText: z.string(),
  retrievalMetadataJson: z.record(z.string(), z.unknown()).default({}),
  isSynthetic: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const recruiterAccessGrantSchema = z.object({
  id: z.string(),
  recruiterCareerIdentityId: z.string(),
  employerPartnerId: z.string(),
  jobSeekerCareerIdentityId: z.string(),
  requestedAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  deniedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  status: recruiterAccessGrantStatusSchema,
  grantedScopes: z.array(recruiterJobPermissionScopeSchema),
  expiresAt: z.string().datetime().nullable(),
  createdByActorType: actorTypeSchema,
  createdByActorId: z.string(),
  approvalSource: z.string(),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const recruiterConversationSchema = z.object({
  id: z.string(),
  recruiterCareerIdentityId: z.string(),
  jobSeekerCareerIdentityId: z.string(),
  status: recruiterConversationStatusSchema,
  lastMessageAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const recruiterJobCitationSchema = z.object({
  jobId: z.string(),
  recruiterCareerIdentityId: z.string(),
  employerPartnerId: z.string(),
  title: z.string(),
});

export const recruiterConversationMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: recruiterConversationMessageRoleSchema,
  content: z.string(),
  citations: z.array(recruiterJobCitationSchema).default([]),
  retrievalMode: recruiterRetrievalModeSchema.nullable().default(null),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export const recruiterA2AProtocolMessageSchema = z.object({
  id: z.string(),
  messageType: recruiterA2AMessageTypeSchema,
  senderAgentId: z.string(),
  receiverAgentId: z.string(),
  recruiterCareerIdentityId: z.string(),
  seekerCareerIdentityId: z.string(),
  accessGrantIdOptional: z.string().nullable().default(null),
  permissionScopes: z.array(recruiterJobPermissionScopeSchema).default([]),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export const syntheticDataSeedRunSchema = z.object({
  id: z.string(),
  seedKey: z.string(),
  seedVersion: z.string(),
  status: syntheticDataSeedRunStatusSchema,
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  summaryJson: z.record(z.string(), z.unknown()).default({}),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const recruiterDiscoveryResponseSchema = z.object({
  employerPartner: employerPartnerSchema,
  recruiters: z.array(recruiterCareerIdentitySchema),
});

export const recruiterAccessRequestInputSchema = z.object({
  requestedScopes: z
    .array(recruiterJobPermissionScopeSchema)
    .default(["view_jobs", "chat_about_jobs", "match_against_my_career_id"]),
  requestMessage: z.string().trim().max(1000).nullable().optional().default(null),
});

export const recruiterAccessStatusResponseSchema = z.object({
  recruiterCareerIdentityId: z.string(),
  employerPartnerId: z.string(),
  jobSeekerCareerIdentityId: z.string(),
  hasAccess: z.boolean(),
  grant: recruiterAccessGrantSchema.nullable(),
});

export const recruiterJobsListResponseSchema = z.object({
  recruiterCareerIdentityId: z.string(),
  employerPartnerId: z.string(),
  jobs: z.array(recruiterOwnedJobSchema),
});

export const recruiterCareerMatchResultSchema = z.object({
  recruiterCareerIdentityId: z.string(),
  jobId: z.string(),
  score: z.number().min(0).max(1),
  rationale: z.string(),
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  fitSummary: z.string(),
});

export const recruiterCareerMatchResponseSchema = z.object({
  recruiterCareerIdentityId: z.string(),
  retrievalMode: recruiterRetrievalModeSchema,
  results: z.array(recruiterCareerMatchResultSchema),
  generatedAt: z.string().datetime(),
});

export const recruiterCareerMatchInputSchema = z.object({
  limit: z.number().int().positive().max(20).default(8),
});

export const recruiterChatInputSchema = z.object({
  conversationId: z.string().trim().min(1).nullable().optional().default(null),
  message: z.string().trim().min(1).max(4000),
  mode: recruiterRetrievalModeSchema.default("recruiter_jobs"),
});

export const recruiterChatResponseSchema = z.object({
  conversation: recruiterConversationSchema,
  assistantMessage: recruiterConversationMessageSchema,
  userMessage: recruiterConversationMessageSchema,
  retrievedJobIds: z.array(z.string()).default([]),
  retrievalMode: recruiterRetrievalModeSchema,
});

export const recruiterAdminSeedSummarySchema = z.object({
  seedRun: syntheticDataSeedRunSchema,
  employerPartners: z.number().int().nonnegative(),
  recruiterCareerIdentities: z.number().int().nonnegative(),
  recruiterOwnedJobs: z.number().int().nonnegative(),
});

export type EmployerPartnerStatus = z.infer<typeof employerPartnerStatusSchema>;
export type RecruiterCareerIdentityStatus = z.infer<typeof recruiterCareerIdentityStatusSchema>;
export type RecruiterCareerIdentityVisibility = z.infer<
  typeof recruiterCareerIdentityVisibilitySchema
>;
export type RecruiterOwnedJobStatus = z.infer<typeof recruiterOwnedJobStatusSchema>;
export type RecruiterOwnedJobVisibility = z.infer<
  typeof recruiterOwnedJobVisibilitySchema
>;
export type RecruiterAccessGrantStatus = z.infer<
  typeof recruiterAccessGrantStatusSchema
>;
export type RecruiterConversationStatus = z.infer<
  typeof recruiterConversationStatusSchema
>;
export type RecruiterConversationMessageRole = z.infer<
  typeof recruiterConversationMessageRoleSchema
>;
export type RecruiterJobPermissionScope = z.infer<
  typeof recruiterJobPermissionScopeSchema
>;
export type RecruiterRetrievalMode = z.infer<typeof recruiterRetrievalModeSchema>;
export type RecruiterA2AMessageType = z.infer<typeof recruiterA2AMessageTypeSchema>;
export type SyntheticDataSeedRunStatus = z.infer<
  typeof syntheticDataSeedRunStatusSchema
>;

export type EmployerPartner = z.infer<typeof employerPartnerSchema>;
export type RecruiterCareerIdentity = z.infer<typeof recruiterCareerIdentitySchema>;
export type RecruiterOwnedJob = z.infer<typeof recruiterOwnedJobSchema>;
export type RecruiterAccessGrant = z.infer<typeof recruiterAccessGrantSchema>;
export type RecruiterConversation = z.infer<typeof recruiterConversationSchema>;
export type RecruiterConversationMessage = z.infer<
  typeof recruiterConversationMessageSchema
>;
export type RecruiterA2AProtocolMessage = z.infer<
  typeof recruiterA2AProtocolMessageSchema
>;
export type RecruiterJobCitation = z.infer<typeof recruiterJobCitationSchema>;
export type SyntheticDataSeedRun = z.infer<typeof syntheticDataSeedRunSchema>;

export type RecruiterDiscoveryResponse = z.infer<
  typeof recruiterDiscoveryResponseSchema
>;
export type RecruiterAccessRequestInput = z.infer<
  typeof recruiterAccessRequestInputSchema
>;
export type RecruiterAccessStatusResponse = z.infer<
  typeof recruiterAccessStatusResponseSchema
>;
export type RecruiterJobsListResponse = z.infer<
  typeof recruiterJobsListResponseSchema
>;
export type RecruiterCareerMatchResult = z.infer<
  typeof recruiterCareerMatchResultSchema
>;
export type RecruiterCareerMatchResponse = z.infer<
  typeof recruiterCareerMatchResponseSchema
>;
export type RecruiterCareerMatchInput = z.infer<
  typeof recruiterCareerMatchInputSchema
>;
export type RecruiterChatInput = z.infer<typeof recruiterChatInputSchema>;
export type RecruiterChatResponse = z.infer<typeof recruiterChatResponseSchema>;
export type RecruiterAdminSeedSummary = z.infer<
  typeof recruiterAdminSeedSummarySchema
>;
