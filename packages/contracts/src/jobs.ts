import { z } from "zod";

export const jobSourceLaneSchema = z.enum(["ats_direct", "aggregator"]);
export const jobSourceQualitySchema = z.enum(["high_signal", "coverage"]);
export const jobSourceStatusSchema = z.enum(["connected", "degraded", "not_configured"]);
export const jobSourceTrustTierSchema = z.enum([
  "trusted_direct",
  "trusted_aggregator",
  "coverage",
  "unknown",
]);
export const jobValidationStatusSchema = z.enum([
  "active_verified",
  "active_unverified",
  "stale",
  "duplicate",
  "expired",
  "invalid",
  "blocked_source",
]);
export const jobWorkplaceTypeSchema = z.enum(["remote", "hybrid", "onsite", "unknown"]);
export const jobApplicationPathTypeSchema = z.enum([
  "ats_hosted",
  "company_careers",
  "aggregator_redirect",
  "external_redirect",
  "unknown",
]);
export const jobSearchOriginSchema = z.enum(["chat_prompt", "panel_refresh", "cta", "api"]);
export const jobSeekerIntentSchema = z.enum([
  "job_search",
  "job_refinement",
  "profile_or_career_id",
  "application_help",
  "general_chat",
  "unsupported",
]);
export const jobSeekerResultQualitySchema = z.enum(["strong", "acceptable", "weak", "empty"]);
export const jobSeekerToolNameSchema = z.enum([
  "searchJobs",
  "getJobById",
  "findSimilarJobs",
  "getUserCareerProfile",
]);
export const jobSearchRemotePreferenceSchema = z.enum([
  "remote_only",
  "remote_preferred",
  "hybrid_preferred",
  "onsite_preferred",
  "flexible",
]);
export const jobSearchRankingBoostSchema = z.enum([
  "profile_alignment",
  "title_alignment",
  "skill_alignment",
  "industry_alignment",
  "location_alignment",
  "freshness",
  "trusted_source",
]);

export const jobPostingSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  externalSourceJobId: z.string().nullable().optional(),
  title: z.string(),
  normalizedTitle: z.string().optional(),
  companyName: z.string(),
  normalizedCompanyName: z.string().optional(),
  location: z.string().nullable(),
  workplaceType: jobWorkplaceTypeSchema.optional(),
  department: z.string().nullable(),
  commitment: z.string().nullable(),
  salaryText: z.string().nullable().optional(),
  sourceKey: z.string(),
  sourceLabel: z.string(),
  sourceLane: jobSourceLaneSchema,
  sourceQuality: jobSourceQualitySchema,
  sourceTrustTier: jobSourceTrustTierSchema.optional(),
  applyUrl: z.string().url(),
  canonicalApplyUrl: z.string().url().optional(),
  canonicalJobUrl: z.string().url().nullable().optional(),
  postedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  descriptionSnippet: z.string().nullable(),
  rawPayload: z.unknown().nullable().optional(),
  ingestedAt: z.string().datetime().optional(),
  lastValidatedAt: z.string().datetime().nullable().optional(),
  validationStatus: jobValidationStatusSchema.optional(),
  trustScore: z.number().min(0).max(1).optional(),
  dedupeFingerprint: z.string().optional(),
  orchestrationReadiness: z.boolean().optional(),
  applicationPathType: jobApplicationPathTypeSchema.optional(),
  redirectRequired: z.boolean().optional(),
  orchestrationMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  matchSignals: z.array(z.string()).optional(),
  matchSummary: z.string().optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  searchReasons: z.array(z.string()).optional(),
});

export const jobSourceSnapshotSchema = z.object({
  key: z.string(),
  label: z.string(),
  lane: jobSourceLaneSchema,
  quality: jobSourceQualitySchema,
  status: jobSourceStatusSchema,
  jobCount: z.number().int().nonnegative(),
  endpointLabel: z.string().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  message: z.string(),
});

export const jobsFeedSummarySchema = z.object({
  totalJobs: z.number().int().nonnegative(),
  directAtsJobs: z.number().int().nonnegative(),
  aggregatorJobs: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  connectedSourceCount: z.number().int().nonnegative(),
  highSignalSourceCount: z.number().int().nonnegative(),
  coverageSourceCount: z.number().int().nonnegative(),
});

export const jobsFeedStorageSchema = z.object({
  mode: z.enum(["database", "ephemeral"]),
  persistedJobs: z.number().int().nonnegative(),
  persistedSources: z.number().int().nonnegative(),
  lastSyncAt: z.string().datetime().nullable(),
});

export const jobsFeedResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  jobs: z.array(jobPostingSchema),
  sources: z.array(jobSourceSnapshotSchema),
  summary: jobsFeedSummarySchema,
  storage: jobsFeedStorageSchema,
});

export const jobSearchFiltersSchema = z.object({
  companies: z.array(z.string()).default([]),
  employmentType: z.string().nullable().default(null),
  exclusions: z.array(z.string()).default([]),
  industries: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  location: z.string().nullable().default(null),
  locations: z.array(z.string()).default([]),
  postedWithinDays: z.number().int().positive().nullable().default(null),
  role: z.string().nullable().default(null),
  roleFamilies: z.array(z.string()).default([]),
  remotePreference: jobSearchRemotePreferenceSchema.nullable().default(null),
  rankingBoosts: z.array(jobSearchRankingBoostSchema).default([]),
  seniority: z.string().nullable().default(null),
  skills: z.array(z.string()).default([]),
  targetJobId: z.string().nullable().default(null),
  workplaceType: jobWorkplaceTypeSchema.nullable().default(null),
});

export const jobSearchQuerySchema = z.object({
  conversationContext: z.string().nullable().default(null),
  prompt: z.string(),
  effectivePrompt: z.string().nullable().default(null),
  normalizedPrompt: z.string(),
  filters: jobSearchFiltersSchema,
  usedCareerIdDefaults: z.boolean().default(false),
  careerIdSignals: z.array(z.string()).default([]),
});

export const jobSeekerProfileContextSchema = z.object({
  available: z.boolean(),
  careerIdentityId: z.string().nullable(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  signals: z.array(z.string()),
  targetRole: z.string().nullable(),
});

export const jobRailCardSchema = z.object({
  applyUrl: z.string().url(),
  company: z.string(),
  jobId: z.string(),
  location: z.string().nullable(),
  matchReason: z.string(),
  relevanceScore: z.number().min(0).max(1).nullable(),
  salaryText: z.string().nullable(),
  summary: z.string().nullable(),
  title: z.string(),
  workplaceType: jobWorkplaceTypeSchema.nullable(),
});

export const jobSeekerAgentTraceEntrySchema = z.object({
  data: z.record(z.string(), z.unknown()).nullable(),
  step: z.string(),
  summary: z.string(),
  timestamp: z.string().datetime(),
});

export const jobSeekerAgentMetadataSchema = z.object({
  clarificationQuestion: z.string().nullable(),
  intent: jobSeekerIntentSchema,
  intentConfidence: z.number().min(0).max(1),
  loopCount: z.number().int().nonnegative(),
  maxLoops: z.number().int().nonnegative(),
  resultQuality: jobSeekerResultQualitySchema.nullable(),
  selectedTool: jobSeekerToolNameSchema.nullable(),
  terminationReason: z.string(),
});

export const jobsPanelResponseSchema = z.object({
  assistantMessage: z.string(),
  agent: jobSeekerAgentMetadataSchema,
  debugTrace: z.array(jobSeekerAgentTraceEntrySchema),
  diagnostics: z.object({
    duplicateCount: z.number().int().nonnegative(),
    filteredOutCount: z.number().int().nonnegative(),
    invalidCount: z.number().int().nonnegative(),
    searchLatencyMs: z.number().int().nonnegative(),
    sourceCount: z.number().int().nonnegative(),
    staleCount: z.number().int().nonnegative(),
  }),
  generatedAt: z.string().datetime(),
  jobs: z.array(jobPostingSchema),
  panelCount: z.number().int().nonnegative(),
  profileContext: jobSeekerProfileContextSchema.nullable(),
  query: jobSearchQuerySchema,
  rail: z.object({
    cards: z.array(jobRailCardSchema),
    emptyState: z.string().nullable(),
  }),
  totalMatches: z.number().int().nonnegative(),
});

export const searchJobsInputSchema = z.object({
  conversationId: z.string().trim().min(1).nullable().optional(),
  limit: z.number().int().positive().max(24).optional(),
  origin: jobSearchOriginSchema.optional(),
  prompt: z.string().trim().min(1),
  refresh: z.boolean().optional(),
});

export const recordJobApplyClickInputSchema = z.object({
  canonicalApplyUrl: z.string().url().optional(),
  conversationId: z.string().trim().min(1).nullable().optional(),
  jobId: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const validateJobsInputSchema = z.object({
  jobIds: z.array(z.string().trim().min(1)).max(200).optional(),
  limit: z.number().int().positive().max(500).optional(),
});

export type JobSourceLane = z.infer<typeof jobSourceLaneSchema>;
export type JobSourceQuality = z.infer<typeof jobSourceQualitySchema>;
export type JobSourceStatus = z.infer<typeof jobSourceStatusSchema>;
export type JobSourceTrustTier = z.infer<typeof jobSourceTrustTierSchema>;
export type JobValidationStatus = z.infer<typeof jobValidationStatusSchema>;
export type JobWorkplaceType = z.infer<typeof jobWorkplaceTypeSchema>;
export type JobApplicationPathType = z.infer<typeof jobApplicationPathTypeSchema>;
export type JobSearchOrigin = z.infer<typeof jobSearchOriginSchema>;
export type JobSeekerIntent = z.infer<typeof jobSeekerIntentSchema>;
export type JobSeekerResultQuality = z.infer<typeof jobSeekerResultQualitySchema>;
export type JobSeekerToolName = z.infer<typeof jobSeekerToolNameSchema>;
export type JobSearchRemotePreference = z.infer<typeof jobSearchRemotePreferenceSchema>;
export type JobSearchRankingBoost = z.infer<typeof jobSearchRankingBoostSchema>;
export type JobPostingDto = z.infer<typeof jobPostingSchema>;
export type JobSourceSnapshotDto = z.infer<typeof jobSourceSnapshotSchema>;
export type JobsFeedSummaryDto = z.infer<typeof jobsFeedSummarySchema>;
export type JobsFeedStorageDto = z.infer<typeof jobsFeedStorageSchema>;
export type JobsFeedResponseDto = z.infer<typeof jobsFeedResponseSchema>;
export type JobSearchFiltersDto = z.infer<typeof jobSearchFiltersSchema>;
export type JobSearchQueryDto = z.infer<typeof jobSearchQuerySchema>;
export type JobSeekerProfileContextDto = z.infer<typeof jobSeekerProfileContextSchema>;
export type JobRailCardDto = z.infer<typeof jobRailCardSchema>;
export type JobSeekerAgentTraceEntryDto = z.infer<typeof jobSeekerAgentTraceEntrySchema>;
export type JobSeekerAgentMetadataDto = z.infer<typeof jobSeekerAgentMetadataSchema>;
export type JobsPanelResponseDto = z.infer<typeof jobsPanelResponseSchema>;
export type SearchJobsInput = z.infer<typeof searchJobsInputSchema>;
export type RecordJobApplyClickInput = z.infer<typeof recordJobApplyClickInputSchema>;
export type ValidateJobsInput = z.infer<typeof validateJobsInputSchema>;
