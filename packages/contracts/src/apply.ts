import { z } from "zod";
import { resumeAssetReferenceSchema, schemaFamilySchema } from "./application-profiles";

export const applyRunStatuses = [
  "created",
  "queued",
  "preflight_validating",
  "preflight_failed",
  "snapshot_created",
  "detecting_target",
  "selecting_adapter",
  "launching_browser",
  "auth_required",
  "filling_form",
  "uploading_documents",
  "navigating_steps",
  "submitting",
  "submitted",
  "submission_unconfirmed",
  "failed",
  "needs_attention",
  "completed",
] as const;

export const applyRunTerminalStatuses = [
  "submitted",
  "failed",
  "needs_attention",
  "submission_unconfirmed",
] as const;

export const applyRunActiveStatuses = [
  "created",
  "queued",
  "preflight_validating",
  "snapshot_created",
  "detecting_target",
  "selecting_adapter",
  "launching_browser",
  "auth_required",
  "filling_form",
  "uploading_documents",
  "navigating_steps",
  "submitting",
] as const;

export const applyFailureCodes = [
  "PROFILE_INCOMPLETE",
  "UNSUPPORTED_TARGET",
  "ATS_DETECTION_FAILED",
  "LOGIN_REQUIRED",
  "CAPTCHA_ENCOUNTERED",
  "REQUIRED_FIELD_UNMAPPED",
  "REQUIRED_DOCUMENT_MISSING",
  "FILE_UPLOAD_FAILED",
  "FORM_STRUCTURE_CHANGED",
  "SUBMIT_BLOCKED",
  "SUBMISSION_NOT_CONFIRMED",
  "NETWORK_FAILURE",
  "TIMEOUT",
  "UNKNOWN_RUNTIME_ERROR",
] as const;

export const applyAtsFamilies = [
  "workday",
  "greenhouse",
  "lever",
  "generic_hosted_form",
  "unsupported_target",
] as const;

export const applyArtifactTypes = [
  "screenshot_initial",
  "screenshot_before_submit",
  "screenshot_after_submit",
  "screenshot_failure",
  "dom_snapshot",
  "trace_export",
  "document_reference",
  "json_debug",
] as const;

export const autonomousApplyDiagnosticReasons = [
  "feature_flag_off",
  "unsupported_target_for_autonomous_mode",
  "queued_workday",
  "queued_supported_target",
  "auth_missing",
  "profile_incomplete",
] as const;

export const applyTargetSupportStatuses = [
  "supported",
  "unsupported",
  "unknown",
] as const;

export const applyRunAlertableStates = [
  "stuck_queued",
  "stuck_in_progress",
] as const;

export const applyRunStatusSchema = z.enum(applyRunStatuses);
export const applyRunTerminalStatusSchema = z.enum(applyRunTerminalStatuses);
export const applyFailureCodeSchema = z.enum(applyFailureCodes);
export const applyAtsFamilySchema = z.enum(applyAtsFamilies);
export const applyArtifactTypeSchema = z.enum(applyArtifactTypes);
export const autonomousApplyDiagnosticReasonSchema = z.enum(autonomousApplyDiagnosticReasons);
export const applyRunAlertableStateSchema = z.enum(applyRunAlertableStates);
export const applyTargetSupportStatusSchema = z.enum(applyTargetSupportStatuses);

const snapshotStringMapSchema = z.record(z.string(), z.unknown()).default({});
const snapshotArraySchema = z.array(z.record(z.string(), z.unknown())).default([]);

export const applicationProfileSnapshotSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  userId: z.string(),
  schemaFamily: schemaFamilySchema,
  profileVersion: z.number().int().positive(),
  identity: z.object({
    email: z.string().nullable().default(null),
    firstName: z.string().nullable().default(null),
    fullName: z.string().nullable().default(null),
    lastName: z.string().nullable().default(null),
  }),
  contact: z.object({
    countryPhoneCode: z.string().nullable().default(null),
    email: z.string().nullable().default(null),
    phone: z.string().nullable().default(null),
  }),
  location: z.object({
    addressLine1: z.string().nullable().default(null),
    city: z.string().nullable().default(null),
    country: z.string().nullable().default(null),
    postalCode: z.string().nullable().default(null),
    region: z.string().nullable().default(null),
  }),
  documents: z.object({
    resume: resumeAssetReferenceSchema.nullable().default(null),
  }),
  workHistory: snapshotArraySchema,
  education: snapshotArraySchema,
  workEligibility: snapshotStringMapSchema,
  sponsorship: snapshotStringMapSchema,
  disclosures: snapshotStringMapSchema,
  links: snapshotStringMapSchema,
  employerSpecificDeltas: snapshotStringMapSchema,
  sourceProfile: z.record(z.string(), z.unknown()),
  provenance: z.object({
    source: z.string(),
    sourceUpdatedAt: z.string().datetime().nullable().default(null),
  }),
});

export const applyRunSchema = z.object({
  id: z.string(),
  userId: z.string(),
  jobId: z.string(),
  jobPostingUrl: z.string().url(),
  companyName: z.string(),
  jobTitle: z.string(),
  atsFamily: applyAtsFamilySchema.nullable().default(null),
  adapterId: z.string().nullable().default(null),
  profileSnapshotId: z.string(),
  status: applyRunStatusSchema,
  terminalState: applyRunTerminalStatusSchema.nullable().default(null),
  failureCode: applyFailureCodeSchema.nullable().default(null),
  failureMessage: z.string().nullable().default(null),
  attemptCount: z.number().int().positive(),
  traceId: z.string().nullable().default(null),
  featureFlagName: z.string().nullable().default(null),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  updatedAt: z.string().datetime(),
});

export const applyRunEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  traceId: z.string().nullable().default(null),
  timestamp: z.string().datetime(),
  state: applyRunStatusSchema,
  stepName: z.string().nullable().default(null),
  eventType: z.string(),
  message: z.string().nullable().default(null),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
});

export const applyRunArtifactSchema = z.object({
  id: z.string(),
  runId: z.string(),
  artifactType: applyArtifactTypeSchema,
  storageKey: z.string(),
  contentType: z.string(),
  metadataJson: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().datetime(),
});

export const atsDetectionResultSchema = z.object({
  atsFamily: applyAtsFamilySchema,
  confidence: z.number().min(0).max(1),
  fallbackStrategy: z.string().nullable().default(null),
  matchedRule: z.string().nullable().default(null),
});

export const createApplyRunInputSchema = z.object({
  canonicalApplyUrl: z.string().url().optional(),
  conversationId: z.string().trim().min(1).nullable().optional(),
  jobId: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createApplyRunResponseSchema = z.object({
  applyRunId: z.string(),
  deduped: z.boolean().default(false),
  featureFlagName: z.string(),
  message: z.string(),
  status: z.literal("queued"),
});

export const applyContinuationDiagnosticSchema = z.object({
  atsFamily: applyAtsFamilySchema.nullable().default(null),
  diagnosticReason: autonomousApplyDiagnosticReasonSchema,
  matchedRule: z.string().nullable().default(null),
});

export const applyContinuationResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("queued"),
    applyRunId: z.string(),
    diagnostic: applyContinuationDiagnosticSchema,
    message: z.string(),
    ok: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("open_external"),
    applyUrl: z.string().nullable(),
    diagnostic: applyContinuationDiagnosticSchema,
    ok: z.boolean().default(true),
  }),
]);

export const applyRunTimelineSummarySchema = z.object({
  latestEventType: z.string().nullable().default(null),
  latestTimestamp: z.string().datetime().nullable().default(null),
  totalEvents: z.number().int().nonnegative(),
});

export const applyRunStatusItemSchema = z.object({
  id: z.string(),
  status: applyRunStatusSchema,
  terminalState: applyRunTerminalStatusSchema.nullable().default(null),
  companyName: z.string(),
  jobTitle: z.string(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  failureCode: applyFailureCodeSchema.nullable().default(null),
  failureMessage: z.string().nullable().default(null),
  traceId: z.string().nullable().default(null),
  alertableState: applyRunAlertableStateSchema.nullable().default(null),
  timelineSummary: applyRunTimelineSummarySchema,
});

export const applyRunListResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  items: z.array(applyRunStatusItemSchema),
});

export const applyRunDetailResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  run: applyRunStatusItemSchema,
  events: z.array(applyRunEventSchema),
});

export type ApplyRunStatus = z.infer<typeof applyRunStatusSchema>;
export type ApplyRunTerminalStatus = z.infer<typeof applyRunTerminalStatusSchema>;
export type ApplyFailureCode = z.infer<typeof applyFailureCodeSchema>;
export type ApplyAtsFamily = z.infer<typeof applyAtsFamilySchema>;
export type ApplyArtifactType = z.infer<typeof applyArtifactTypeSchema>;
export type AutonomousApplyDiagnosticReason = z.infer<
  typeof autonomousApplyDiagnosticReasonSchema
>;
export type ApplyRunAlertableState = z.infer<typeof applyRunAlertableStateSchema>;
export type ApplicationProfileSnapshotDto = z.infer<typeof applicationProfileSnapshotSchema>;
export type ApplyRunDto = z.infer<typeof applyRunSchema>;
export type ApplyRunEventDto = z.infer<typeof applyRunEventSchema>;
export type ApplyRunArtifactDto = z.infer<typeof applyRunArtifactSchema>;
export type AtsDetectionResultDto = z.infer<typeof atsDetectionResultSchema>;
export type CreateApplyRunInput = z.infer<typeof createApplyRunInputSchema>;
export type CreateApplyRunResponse = z.infer<typeof createApplyRunResponseSchema>;
export type ApplyContinuationResponse = z.infer<typeof applyContinuationResponseSchema>;
export type ApplyRunTimelineSummary = z.infer<typeof applyRunTimelineSummarySchema>;
export type ApplyRunStatusItem = z.infer<typeof applyRunStatusItemSchema>;
export type ApplyRunListResponse = z.infer<typeof applyRunListResponseSchema>;
export type ApplyRunDetailResponse = z.infer<typeof applyRunDetailResponseSchema>;
