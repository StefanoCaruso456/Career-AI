import { z } from "zod";
import { errorCodeSchema } from "./enums";
import {
  agentIdSchema,
  a2aTaskLifecycleStatusSchema,
  candidateAgentRequestSchema,
  internalAgentCapabilitySchema,
  internalAgentOperationSchema,
  internalAgentQuotaMetadataSchema,
  internalAgentRoleSchema,
  internalAgentStopReasonSchema,
  recruiterAgentRequestSchema,
  verifierAgentRequestSchema,
} from "./agent-internal";
import {
  employerCandidateSearchResponseSchema,
  searchEmployerCandidatesInputSchema,
} from "./recruiter";
import { w3cPresentationSummarySchema } from "./presentation";

export const externalAgentProtocolVersions = ["a2a.v1"] as const;
export const externalAgentAuthTypes = ["external_service_bearer"] as const;
export const externalAgentStatuses = ["success", "error"] as const;
export const externalAgentTaskTypes = ["respond", "candidate_search"] as const;

export const externalAgentProtocolVersionSchema = z.enum(externalAgentProtocolVersions);
export const externalAgentRequiredAuthTypeSchema = z.enum(externalAgentAuthTypes);
export const externalAgentStatusSchema = z.enum(externalAgentStatuses);
export const externalAgentTaskTypeSchema = z.enum(externalAgentTaskTypes);

const externalAgentErrorDetailsSchema = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.string()),
  z.null(),
]);

const nullableTrimmedStringSchema = z.string().trim().min(1).max(200).nullable().optional().default(null);

export const externalAgentRequestMetadataSchema = z
  .object({
    callerName: nullableTrimmedStringSchema,
    callerVersion: nullableTrimmedStringSchema,
    correlationId: nullableTrimmedStringSchema,
  })
  .passthrough()
  .default({
    callerName: null,
    callerVersion: null,
    correlationId: null,
  });

export const externalAgentProtocolContextSchema = z
  .object({
    callerName: nullableTrimmedStringSchema,
    callerVersion: nullableTrimmedStringSchema,
    conversationId: nullableTrimmedStringSchema,
    correlationId: nullableTrimmedStringSchema,
    sourceEndpoint: nullableTrimmedStringSchema,
    threadId: nullableTrimmedStringSchema,
  })
  .passthrough()
  .default({
    callerName: null,
    callerVersion: null,
    conversationId: null,
    correlationId: null,
    sourceEndpoint: null,
    threadId: null,
  });

export const externalAgentEnvelopeAuthSchema = z
  .object({
    authType: z.enum(["external_service_bearer", "internal_service_bearer"]).nullable().optional().default(
      null,
    ),
    authenticatedSenderId: agentIdSchema.nullable().optional().default(null),
    serviceName: nullableTrimmedStringSchema,
  })
  .passthrough()
  .nullable()
  .optional()
  .default(null);

export const recruiterCandidateSearchPayloadSchema = searchEmployerCandidatesInputSchema.extend({
  organizationId: z.string().trim().min(1).nullable().optional().default(null),
  userId: z.string().trim().min(1),
});

function createExternalAgentRequestEnvelopeSchema<
  TAgentType extends z.infer<typeof internalAgentRoleSchema>,
  TPayload extends z.ZodTypeAny,
>(agentType: TAgentType, payloadSchema: TPayload) {
  return z
    .object({
      agentType: z.literal(agentType),
      auth: externalAgentEnvelopeAuthSchema,
      context: externalAgentProtocolContextSchema,
      conversationId: nullableTrimmedStringSchema,
      deadline: z.string().datetime().nullable().optional().default(null),
      idempotencyKey: nullableTrimmedStringSchema,
      messageId: z.string().trim().min(1).max(200),
      metadata: externalAgentRequestMetadataSchema,
      operation: internalAgentOperationSchema.default("respond"),
      parentRunId: z.string().trim().min(1).max(200).nullable().optional().default(null),
      payload: payloadSchema,
      protocolVersion: externalAgentProtocolVersionSchema,
      replyTo: z.string().trim().min(1).max(200).nullable().optional().default(null),
      requestId: z.string().trim().min(1).max(200),
      receiverAgentId: agentIdSchema,
      senderAgentId: agentIdSchema,
      sentAt: z.string().datetime(),
      taskType: externalAgentTaskTypeSchema,
      threadId: nullableTrimmedStringSchema,
      traceId: z.string().trim().min(1).max(200),
      version: externalAgentProtocolVersionSchema.optional(),
    })
    .superRefine((value, context) => {
      if (value.version && value.version !== value.protocolVersion) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "version must match protocolVersion when both are provided.",
          path: ["version"],
        });
      }

      if (value.taskType !== value.operation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "taskType must match operation for A2A requests.",
          path: ["taskType"],
        });
      }
    })
    .transform((value) => ({
      ...value,
      version: value.version ?? value.protocolVersion,
    }));
}

export const externalCandidateAgentRequestSchema = createExternalAgentRequestEnvelopeSchema(
  "candidate",
  candidateAgentRequestSchema,
);
export const externalRecruiterAgentRequestSchema = createExternalAgentRequestEnvelopeSchema(
  "recruiter",
  z.union([recruiterAgentRequestSchema, recruiterCandidateSearchPayloadSchema]),
);
export const externalVerifierAgentRequestSchema = createExternalAgentRequestEnvelopeSchema(
  "verifier",
  verifierAgentRequestSchema,
);

export const externalAgentArtifactSchema = z
  .object({
    id: z.string().trim().min(1).max(200).nullable().optional().default(null),
    kind: z.string().trim().min(1).max(120),
    title: nullableTrimmedStringSchema,
    uri: nullableTrimmedStringSchema,
  })
  .passthrough();

export const externalAgentNextActionSchema = z
  .object({
    action: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(200),
  })
  .passthrough();

export const externalAgentResultSchema = z.object({
  presentationSummary: w3cPresentationSummarySchema.nullable().optional().default(null),
  reply: z.string(),
  runId: z.string().trim().min(1),
  stepsUsed: z.number().int().nonnegative(),
  stopReason: internalAgentStopReasonSchema,
  toolCallsUsed: z.number().int().nonnegative(),
});

export const externalAgentResultPayloadSchema = z.union([
  externalAgentResultSchema,
  employerCandidateSearchResponseSchema,
  z.record(z.string(), z.unknown()),
]);

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

const externalAgentResponseEnvelopeBaseSchema = z
  .object({
    agentType: internalAgentRoleSchema,
    artifacts: z.array(externalAgentArtifactSchema).default([]),
    completedAt: z.string().datetime(),
    confidence: z.number().min(0).max(1).nullable().optional().default(null),
    messageId: z.string().trim().min(1).max(200),
    metadata: externalAgentResponseMetadataSchema,
    nextActions: z.array(externalAgentNextActionSchema).default([]),
    operation: internalAgentOperationSchema,
    protocolVersion: externalAgentProtocolVersionSchema,
    receiverAgentId: agentIdSchema,
    requestId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    senderAgentId: agentIdSchema,
    taskStatus: a2aTaskLifecycleStatusSchema,
    traceId: z.string().trim().min(1),
    version: externalAgentProtocolVersionSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.version && value.version !== value.protocolVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "version must match protocolVersion when both are provided.",
        path: ["version"],
      });
    }
  });

export const externalAgentSuccessResponseSchema = externalAgentResponseEnvelopeBaseSchema
  .extend({
    error: z.null().optional().default(null),
    errors: z.array(externalAgentErrorSchema).default([]),
    ok: z.literal(true),
    result: externalAgentResultPayloadSchema,
    status: z.literal("success"),
  })
  .transform((value) => ({
    ...value,
    version: value.version ?? value.protocolVersion,
  }));

export const externalAgentErrorResponseSchema = externalAgentResponseEnvelopeBaseSchema
  .extend({
    error: externalAgentErrorSchema,
    errors: z.array(externalAgentErrorSchema).min(1),
    ok: z.literal(false),
    result: z.null(),
    status: z.literal("error"),
  })
  .transform((value) => ({
    ...value,
    version: value.version ?? value.protocolVersion,
  }));

export const externalAgentCardSchema = z.object({
  agentId: agentIdSchema,
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

export const externalAgentDiscoveryResponseSchema = z
  .object({
    agents: z.array(externalAgentCardSchema),
    metadata: z.object({
      correlationId: z.string().trim().min(1),
      requestId: z.string().trim().min(1),
    }),
    protocolVersion: externalAgentProtocolVersionSchema,
    version: externalAgentProtocolVersionSchema.optional(),
  })
  .transform((value) => ({
    ...value,
    version: value.version ?? value.protocolVersion,
  }));

export const externalAgentCardResponseSchema = z
  .object({
    card: externalAgentCardSchema,
    metadata: z.object({
      correlationId: z.string().trim().min(1),
      requestId: z.string().trim().min(1),
    }),
    protocolVersion: externalAgentProtocolVersionSchema,
    version: externalAgentProtocolVersionSchema.optional(),
  })
  .transform((value) => ({
    ...value,
    version: value.version ?? value.protocolVersion,
  }));

export type ExternalAgentProtocolVersion = z.infer<typeof externalAgentProtocolVersionSchema>;
export type ExternalAgentStatus = z.infer<typeof externalAgentStatusSchema>;
export type ExternalAgentTaskType = z.infer<typeof externalAgentTaskTypeSchema>;
export type ExternalCandidateAgentRequest = z.infer<typeof externalCandidateAgentRequestSchema>;
export type ExternalRecruiterAgentRequest = z.infer<typeof externalRecruiterAgentRequestSchema>;
export type ExternalVerifierAgentRequest = z.infer<typeof externalVerifierAgentRequestSchema>;
export type ExternalAgentArtifact = z.infer<typeof externalAgentArtifactSchema>;
export type ExternalAgentNextAction = z.infer<typeof externalAgentNextActionSchema>;
export type ExternalAgentResult = z.infer<typeof externalAgentResultSchema>;
export type ExternalAgentResultPayload = z.infer<typeof externalAgentResultPayloadSchema>;
export type ExternalAgentResponseMetadata = z.infer<typeof externalAgentResponseMetadataSchema>;
export type ExternalAgentError = z.infer<typeof externalAgentErrorSchema>;
export type ExternalAgentSuccessResponse = z.infer<typeof externalAgentSuccessResponseSchema>;
export type ExternalAgentErrorResponse = z.infer<typeof externalAgentErrorResponseSchema>;
export type ExternalAgentCard = z.infer<typeof externalAgentCardSchema>;
