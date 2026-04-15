import { z } from "zod";
import { errorCodeSchema } from "./enums";
import {
  w3cPresentationEnvelopeSchema,
  w3cPresentationSummarySchema,
} from "./presentation";

export const internalAgentSchemaVersions = ["v1"] as const;
export const internalAgentOperations = ["respond", "candidate_search"] as const;
export const internalAgentAuthTypes = ["internal_service_bearer"] as const;
export const a2aTaskLifecycleStatuses = [
  "accepted",
  "running",
  "awaiting_input",
  "completed",
  "failed",
  "partial",
  "cancelled",
] as const;

export const internalAgentSchemaVersionSchema = z.enum(internalAgentSchemaVersions);
export const internalAgentOperationSchema = z.enum(internalAgentOperations);
export const internalAgentRequiredAuthTypeSchema = z.enum(internalAgentAuthTypes);
export const internalAgentRoleSchema = z.enum(["candidate", "recruiter", "verifier"]);
export const agentIdSchema = z.string().trim().min(1).max(200);
export const internalAgentMessageRoleSchema = z.enum(["assistant", "user"]);
export const a2aTaskLifecycleStatusSchema = z.enum(a2aTaskLifecycleStatuses);
export const internalAgentStopReasonSchema = z.enum([
  "completed",
  "empty_response",
  "max_steps_reached",
  "max_tool_calls_reached",
  "model_error",
  "overall_timeout",
  "step_timeout",
  "tool_error",
]);

const internalAgentErrorDetailsSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.string()),
  z.null(),
]);

export const internalAgentMessageSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  role: internalAgentMessageRoleSchema,
});

const internalAgentRequestPayloadBaseSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  messages: z.array(internalAgentMessageSchema).max(20).default([]),
});

export const candidateAgentRequestSchema = internalAgentRequestPayloadBaseSchema.extend({
  talentIdentityId: z.string().trim().min(1),
});

export const recruiterAgentRequestSchema = internalAgentRequestPayloadBaseSchema.extend({
  organizationId: z.string().trim().min(1).nullable().optional().default(null),
  userId: z.string().trim().min(1),
});

export const verifierAgentRequestSchema = internalAgentRequestPayloadBaseSchema.extend({
  claimId: z.string().trim().min(1).nullable().optional().default(null),
  presentation: w3cPresentationEnvelopeSchema.nullable().optional().default(null),
  subjectTalentIdentityId: z.string().trim().min(1).nullable().optional().default(null),
  verificationRecordId: z.string().trim().min(1).nullable().optional().default(null),
});

export const internalAgentRequestMetadataSchema = z
  .object({
    callerServiceName: z.string().trim().min(1).nullable().optional().default(null),
    clientVersion: z.string().trim().min(1).nullable().optional().default(null),
    forwardedCorrelationId: z.string().trim().min(1).nullable().optional().default(null),
    forwardedRunId: z.string().trim().min(1).nullable().optional().default(null),
  })
  .passthrough()
  .default({
    callerServiceName: null,
    clientVersion: null,
    forwardedCorrelationId: null,
    forwardedRunId: null,
  });

function createInternalAgentRequestEnvelopeSchema<
  TAgentType extends z.infer<typeof internalAgentRoleSchema>,
  TPayload extends z.ZodTypeAny,
>(agentType: TAgentType, payloadSchema: TPayload) {
  return z.object({
    agentType: z.literal(agentType),
    metadata: internalAgentRequestMetadataSchema,
    operation: internalAgentOperationSchema.default("respond"),
    payload: payloadSchema,
    requestId: z.string().trim().min(1).max(200).nullable().optional().default(null),
    version: internalAgentSchemaVersionSchema,
  });
}

export const candidateAgentEnvelopeSchema = createInternalAgentRequestEnvelopeSchema(
  "candidate",
  candidateAgentRequestSchema,
);
export const recruiterAgentEnvelopeSchema = createInternalAgentRequestEnvelopeSchema(
  "recruiter",
  recruiterAgentRequestSchema,
);
export const verifierAgentEnvelopeSchema = createInternalAgentRequestEnvelopeSchema(
  "verifier",
  verifierAgentRequestSchema,
);

export const internalAgentResponseSchema = z.object({
  presentationSummary: w3cPresentationSummarySchema.nullable().optional().default(null),
  reply: z.string(),
  role: internalAgentRoleSchema,
  runId: z.string().trim().min(1),
  stepsUsed: z.number().int().nonnegative(),
  stopReason: internalAgentStopReasonSchema,
  toolCallsUsed: z.number().int().nonnegative(),
});

export const internalAgentQuotaMetadataSchema = z.object({
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
  resetAt: z.string().trim().min(1),
  windowMs: z.number().int().positive(),
});

export const internalAgentResponseMetadataSchema = z.object({
  callerServiceName: z.string().trim().min(1).nullable().optional().default(null),
  correlationId: z.string().trim().min(1),
  durationMs: z.number().int().nonnegative(),
  endpoint: z.string().trim().min(1),
  quota: internalAgentQuotaMetadataSchema.nullable().optional().default(null),
  traceId: z.string().trim().min(1).nullable().optional().default(null),
});

export const internalAgentErrorSchema = z.object({
  code: errorCodeSchema,
  correlationId: z.string().trim().min(1),
  details: internalAgentErrorDetailsSchema.default(null),
  message: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
  retryable: z.boolean(),
});

export const internalAgentSuccessResponseSchema = z
  .object({
    agentType: internalAgentRoleSchema,
    error: z.null().optional().default(null),
    metadata: internalAgentResponseMetadataSchema,
    ok: z.literal(true),
    operation: internalAgentOperationSchema,
    payload: internalAgentResponseSchema,
    requestId: z.string().trim().min(1),
    version: internalAgentSchemaVersionSchema,
  })
  .merge(internalAgentResponseSchema)
  .superRefine((value, context) => {
    if (value.agentType !== value.role) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agentType must match role for successful internal agent responses.",
        path: ["agentType"],
      });
    }
  });

export const internalAgentErrorResponseSchema = z.object({
  agentType: internalAgentRoleSchema,
  correlation_id: z.string().trim().min(1),
  details: internalAgentErrorDetailsSchema.default(null),
  error: internalAgentErrorSchema,
  error_code: errorCodeSchema,
  message: z.string().trim().min(1),
  metadata: internalAgentResponseMetadataSchema,
  ok: z.literal(false),
  operation: internalAgentOperationSchema,
  payload: z.null(),
  requestId: z.string().trim().min(1),
  version: internalAgentSchemaVersionSchema,
});

export const internalAgentCapabilitySchema = z.object({
  description: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const internalAgentCardSchema = z.object({
  agentId: agentIdSchema,
  agentType: internalAgentRoleSchema,
  allowedTools: z.array(z.string().trim().min(1)).min(1),
  capabilities: z.array(internalAgentCapabilitySchema).min(1),
  name: z.string().trim().min(1),
  requiredAuthType: internalAgentRequiredAuthTypeSchema,
  role: internalAgentRoleSchema,
  supportedOperations: z.array(internalAgentOperationSchema).min(1),
  supportedRequestVersions: z.array(internalAgentSchemaVersionSchema).min(1),
  supportedResponseVersions: z.array(internalAgentSchemaVersionSchema).min(1),
});

export type InternalAgentSchemaVersion = z.infer<typeof internalAgentSchemaVersionSchema>;
export type InternalAgentRole = z.infer<typeof internalAgentRoleSchema>;
export type AgentId = z.infer<typeof agentIdSchema>;
export type InternalAgentMessage = z.infer<typeof internalAgentMessageSchema>;
export type A2ATaskLifecycleStatus = z.infer<typeof a2aTaskLifecycleStatusSchema>;
export type InternalAgentStopReason = z.infer<typeof internalAgentStopReasonSchema>;
export type CandidateAgentRequest = z.infer<typeof candidateAgentRequestSchema>;
export type RecruiterAgentRequest = z.infer<typeof recruiterAgentRequestSchema>;
export type VerifierAgentRequest = z.infer<typeof verifierAgentRequestSchema>;
export type CandidateAgentEnvelope = z.infer<typeof candidateAgentEnvelopeSchema>;
export type RecruiterAgentEnvelope = z.infer<typeof recruiterAgentEnvelopeSchema>;
export type VerifierAgentEnvelope = z.infer<typeof verifierAgentEnvelopeSchema>;
export type InternalAgentResponse = z.infer<typeof internalAgentResponseSchema>;
export type InternalAgentQuotaMetadata = z.infer<typeof internalAgentQuotaMetadataSchema>;
export type InternalAgentResponseMetadata = z.infer<typeof internalAgentResponseMetadataSchema>;
export type InternalAgentError = z.infer<typeof internalAgentErrorSchema>;
export type InternalAgentSuccessResponse = z.infer<typeof internalAgentSuccessResponseSchema>;
export type InternalAgentErrorResponse = z.infer<typeof internalAgentErrorResponseSchema>;
export type InternalAgentCard = z.infer<typeof internalAgentCardSchema>;
