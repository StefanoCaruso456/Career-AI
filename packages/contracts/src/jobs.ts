import { z } from "zod";

export const jobSourceLaneSchema = z.enum(["ats_direct", "aggregator"]);
export const jobSourceQualitySchema = z.enum(["high_signal", "coverage"]);
export const jobSourceStatusSchema = z.enum(["connected", "degraded", "not_configured"]);

export const jobPostingSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  title: z.string(),
  companyName: z.string(),
  location: z.string().nullable(),
  department: z.string().nullable(),
  commitment: z.string().nullable(),
  sourceKey: z.string(),
  sourceLabel: z.string(),
  sourceLane: jobSourceLaneSchema,
  sourceQuality: jobSourceQualitySchema,
  applyUrl: z.string().url(),
  postedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
  descriptionSnippet: z.string().nullable(),
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

export type JobSourceLane = z.infer<typeof jobSourceLaneSchema>;
export type JobSourceQuality = z.infer<typeof jobSourceQualitySchema>;
export type JobSourceStatus = z.infer<typeof jobSourceStatusSchema>;
export type JobPostingDto = z.infer<typeof jobPostingSchema>;
export type JobSourceSnapshotDto = z.infer<typeof jobSourceSnapshotSchema>;
export type JobsFeedSummaryDto = z.infer<typeof jobsFeedSummarySchema>;
export type JobsFeedStorageDto = z.infer<typeof jobsFeedStorageSchema>;
export type JobsFeedResponseDto = z.infer<typeof jobsFeedResponseSchema>;
