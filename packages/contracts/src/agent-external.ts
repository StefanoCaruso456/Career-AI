import { z } from "zod";
import { errorCodeSchema } from "./enums";
import {
  candidateAgentRequestSchema,
  internalAgentCapabilitySchema,
  internalAgentOperationSchema,
  internalAgentQuotaMetadataSchema,
  internalAgentRoleSchema,
  internalAgentStopReasonSchema,
  recruiterAgentRequestSchema,
  verifierAgentRequestSchema,
} from "./agent-internal";
import { w3cPresentationSummarySchema } from "./presentation";

export const externalAgentProtocolVersions = ["a2a.v1"] as const;
export const externalAgentAuthTypes = ["external_service_bearer"] as const;
export const externalAgentTaskStatuses = ["completed", "failed"] as const;

export const externalAgentProtocolVersionSchema = z.enum(externalAgentProtocolVersions);
export const externalAgentRequiredAuthTypeSchema = z.enum(externalAgentAuthTypes);
export const externalAgentTaskStatusSchema = z.enum(externalAgentTaskStatuses);

const externalAgentErrorDetailsSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.string()),
  z.null(),
]);

export const externalAgentRequestMetadataSchema = z
  .object({
    callerName: z.string().trim().min(1).nullable().optional().default(null),
    callerVersion: z.string().trim().min(1).nullable().optional().default(null),
    correlationId: z.string().trim().min(1).nullable().optional().default(null),
  })
  .passthrough()
  .default({
    callerName: null,
    callerVersion: null,
    correlationId: null,
  });

function createExternalAgentRequestEnvelopeSchema<
  TAgentType extends z.infer<typeof internalAgentRoleSchema>,
  TPayload extends z.ZodTypeAny,
>(agentType: TAgentType, payloadSchema: TPayload) {
  return z.object({
    agentType: z.literal(agentType),
    metadata: externalAgentRequestMetadataSchema,
    operation: internalAgentOperationSchema.default("respond"),
    payload: payloadSchema,
    requestId: z.string().trim().min(1).max(200).nullable().optional().default(null),
    version: externalAgentProtocolVersionSchema,
  });
}

export const externalCandidateAgentRequestSchema = createExternalAgentRequestEnvelopeSchema(
  "candidate",
  candidateAgentRequestSchema,
);
export const externalRecruiterAgentRequestSchema = createExternalAgentRequestEnvelopeSchema(
  "recruiter",
  recruiterAgentRequestSchema,
);
export const externalVerifierAgentRequestSchema = createExternalAgentRequestEnvelopeSchema(
  "verifier",
  verifierAgentRequestSchema,
);

export const externalAgentResultSchema = z.object({
  presentationSummary: w3cPresentationSummarySchema.nullable().optional().default(null),
  reply: z.string(),
  runId: z.string().trim().min(1),
  stepsUsed: z.number().int().nonnegative(),
  stopReason: internalAgentStopReasonSchema,
  toolCallsUsed: z.number().int().nonnegative(),
});

export const externalAgentResponseMetadataSchema = z.object({
  callerServiceName: z.string().trim().min(1).nullable().optional().default(null),
  correlationId: z.string().trim().min(1),
  durationMs: z.number().int().nonnegative(),
  endpoint: z.string().trim().min(1),
  quota: internalAgentQuotaMetadataSchema.nullable().optional().default(null),
  traceId: z.string().trim().min(1).nullable().optional().default(null),
});

export const externalAgentErrorSchema = z.object({
  code: errorCodeSchema,
  correlationId: z.string().trim().min(1),
  details: externalAgentErrorDetailsSchema.default(null),
  message: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
  retryable: z.boolean(),
});

export const externalAgentSuccessResponseSchema = z.object({
  agentType: internalAgentRoleSchema,
  error: z.null().optional().default(null),
  metadata: externalAgentResponseMetadataSchema,
  ok: z.literal(true),
  operation: internalAgentOperationSchema,
  requestId: z.string().trim().min(1),
  result: externalAgentResultSchema,
  taskStatus: z.literal("completed"),
  version: externalAgentProtocolVersionSchema,
});

export const externalAgentErrorResponseSchema = z.object({
  agentType: internalAgentRoleSchema,
  error: externalAgentErrorSchema,
  metadata: externalAgentResponseMetadataSchema,
  ok: z.literal(false),
  operation: internalAgentOperationSchema,
  requestId: z.string().trim().min(1),
  result: z.null(),
  taskStatus: z.literal("failed"),
  version: externalAgentProtocolVersionSchema,
});

export const externalAgentCardSchema = z.object({
  agentType: internalAgentRoleSchema,
  capabilities: z.array(internalAgentCapabilitySchema).min(1),
  endpoint: z.string().trim().min(1),
  name: z.string().trim().min(1),
  requiredAuthType: externalAgentRequiredAuthTypeSchema,
  role: internalAgentRoleSchema,
  supportedOperations: z.array(internalAgentOperationSchema).min(1),
  supportedProtocolVersions: z.array(externalAgentProtocolVersionSchema).min(1),
  supportedRequestVersions: z.array(externalAgentProtocolVersionSchema).min(1),
  supportedResponseVersions: z.array(externalAgentProtocolVersionSchema).min(1),
});

export const externalAgentDiscoveryResponseSchema = z.object({
  agents: z.array(externalAgentCardSchema),
  metadata: z.object({
    correlationId: z.string().trim().min(1),
    requestId: z.string().trim().min(1),
  }),
  version: externalAgentProtocolVersionSchema,
});

export const externalAgentCardResponseSchema = z.object({
  card: externalAgentCardSchema,
  metadata: z.object({
    correlationId: z.string().trim().min(1),
    requestId: z.string().trim().min(1),
  }),
  version: externalAgentProtocolVersionSchema,
});

export type ExternalAgentProtocolVersion = z.infer<typeof externalAgentProtocolVersionSchema>;
export type ExternalAgentTaskStatus = z.infer<typeof externalAgentTaskStatusSchema>;
export type ExternalCandidateAgentRequest = z.infer<typeof externalCandidateAgentRequestSchema>;
export type ExternalRecruiterAgentRequest = z.infer<typeof externalRecruiterAgentRequestSchema>;
export type ExternalVerifierAgentRequest = z.infer<typeof externalVerifierAgentRequestSchema>;
export type ExternalAgentResult = z.infer<typeof externalAgentResultSchema>;
export type ExternalAgentResponseMetadata = z.infer<typeof externalAgentResponseMetadataSchema>;
export type ExternalAgentError = z.infer<typeof externalAgentErrorSchema>;
export type ExternalAgentSuccessResponse = z.infer<typeof externalAgentSuccessResponseSchema>;
export type ExternalAgentErrorResponse = z.infer<typeof externalAgentErrorResponseSchema>;
export type ExternalAgentCard = z.infer<typeof externalAgentCardSchema>;
