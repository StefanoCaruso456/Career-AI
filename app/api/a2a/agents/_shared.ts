import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import {
  buildAgentHandoffMetadata,
  emitAgentHandoffEvent,
  traceAgentHandoff,
} from "@/lib/agent-handoff-tracing";
import {
  getA2AProtocolParticipantForAgent,
  resolveA2AProtocolParticipant,
  type A2AProtocolParticipant,
} from "@/lib/a2a/participants";
import {
  emitA2AProtocolEvent,
  type A2AProtocolContext,
} from "@/lib/a2a/protocol-runtime";
import {
  applyTraceResponseHeaders,
  getRequestTraceContext,
  traceSpan,
  updateRequestTraceContext,
} from "@/lib/tracing";
import {
  getExternalAgentCard,
  getExternalAgentRouteDefinition,
  type ExternalAgentRouteDefinition,
} from "@/lib/a2a/registry";
import { consumeExternalA2AQuota } from "@/lib/a2a/rate-limit";
import {
  resolveVerifiedExternalAgentCaller,
  type ExternalAgentCaller,
} from "@/lib/a2a/auth";
import { createRunContext, type RunContext } from "@/packages/agent-runtime/src";
import {
  errorResponse,
  getCorrelationId,
  logAuditEvent,
  successResponse,
} from "@/packages/audit-security/src";
import {
  ApiError,
  externalAgentCardResponseSchema,
  externalAgentEnvelopeAuthSchema,
  externalAgentDiscoveryResponseSchema,
  externalAgentErrorResponseSchema,
  externalAgentProtocolContextSchema,
  externalAgentRequestMetadataSchema,
  externalAgentResponseMetadataSchema,
  externalAgentResultSchema,
  externalAgentSuccessResponseSchema,
  externalCandidateAgentRequestSchema,
  internalAgentOperationSchema,
  externalRecruiterAgentRequestSchema,
  externalVerifierAgentRequestSchema,
  type ExternalAgentError,
  type ExternalAgentProtocolVersion,
  type InternalAgentQuotaMetadata,
  type InternalAgentRole,
  type InternalAgentStopReason,
} from "@/packages/contracts/src";

export type ExternalAgentParsedRequest<TPayload> = {
  agentType: InternalAgentRole;
  auth: z.infer<typeof externalAgentEnvelopeAuthSchema>;
  context: z.infer<typeof externalAgentProtocolContextSchema>;
  conversationId: string | null;
  deadline: string | null;
  idempotencyKey: string | null;
  messageId: string;
  metadata: z.infer<typeof externalAgentRequestMetadataSchema>;
  operation: z.infer<typeof internalAgentOperationSchema>;
  parentRunId: string | null;
  payload: TPayload;
  protocolVersion: ExternalAgentProtocolVersion;
  receiverAgentId: string;
  replyTo: string | null;
  requestId: string;
  senderAgentId: string;
  sentAt: string;
  taskType: z.infer<typeof internalAgentOperationSchema>;
  threadId: string | null;
  traceId: string;
  version: ExternalAgentProtocolVersion;
};

export type ExternalAgentOperationDefinition = Omit<ExternalAgentRouteDefinition, "operation"> & {
  operation: z.infer<typeof internalAgentOperationSchema>;
};

type ExternalAgentRouteContext = {
  caller: ExternalAgentCaller;
  correlationId: string;
  definition: ExternalAgentRouteDefinition;
  fallbackRequestId: string;
  runContext: RunContext;
  startedAt: number;
};

type ExternalDiscoveryContext = {
  caller: ExternalAgentCaller;
  correlationId: string;
  requestId: string;
};

type ExternalAgentProtocolResolution = {
  receiverParticipant: A2AProtocolParticipant;
  senderParticipant: A2AProtocolParticipant;
};

function getBaseUrl(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return process.env.NEXTAUTH_URL ?? null;
  }
}

export function isExternalA2AEnabled() {
  const configuredValue = process.env.EXTERNAL_A2A_ENABLED?.trim().toLowerCase();

  return configuredValue === "1" || configuredValue === "true";
}

function assertExternalA2AEnabled(correlationId: string) {
  if (isExternalA2AEnabled()) {
    return;
  }

  throw new ApiError({
    errorCode: "NOT_FOUND",
    status: 404,
    message: "External agent endpoints are not enabled.",
    details: null,
    correlationId,
  });
}

function isRetryableErrorCode(code: ExternalAgentError["code"]) {
  return code === "RATE_LIMITED" || code === "DEPENDENCY_FAILURE" || code === "INTERNAL_ERROR";
}

function toApiError(error: unknown, fallbackCorrelationId: string) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new ApiError({
      errorCode: "VALIDATION_FAILED",
      status: 422,
      message: "Request validation failed.",
      details: error.flatten(),
      correlationId: fallbackCorrelationId,
    });
  }

  return new ApiError({
    errorCode: "INTERNAL_ERROR",
    status: 500,
    message: "An unexpected error occurred.",
    details: null,
    correlationId: fallbackCorrelationId,
  });
}

function buildMetadata(args: {
  callerServiceName: string | null;
  correlationId: string;
  durationMs: number;
  endpoint: string;
  quota: InternalAgentQuotaMetadata | null;
}) {
  const traceContext = getRequestTraceContext();

  return externalAgentResponseMetadataSchema.parse({
    callerServiceName: args.callerServiceName,
    correlationId: args.correlationId,
    durationMs: args.durationMs,
    endpoint: args.endpoint,
    quota: args.quota,
    traceId: traceContext?.traceId ?? null,
  });
}

function buildExternalAgentHandoffMetadata(args: {
  authSubject?: string | null;
  childRunId?: string | null;
  definition: Pick<ExternalAgentRouteDefinition, "agentType" | "endpointPath" | "operation">;
  handoffReason: string;
  parentRunId?: string | null;
  permissionDecision?: string | null;
  protocolVersion?: ExternalAgentProtocolVersion | null;
  requestId?: string | null;
  taskStatus?: string | null;
}) {
  return buildAgentHandoffMetadata({
    a2aProtocolVersion: args.protocolVersion ?? null,
    a2aRequestId: args.requestId ?? null,
    authSubject: args.authSubject ?? null,
    childRunId: args.childRunId ?? null,
    handoffReason: args.handoffReason,
    handoffType: "external_a2a_dispatch",
    operation: args.definition.operation,
    parentRunId: args.parentRunId ?? null,
    permissionDecision: args.permissionDecision ?? null,
    targetAgentType: args.definition.agentType,
    targetEndpoint: args.definition.endpointPath,
    taskStatus: args.taskStatus ?? null,
  });
}

function buildExternalAgentAuditMetadata(
  baseMetadata: Record<string, unknown>,
  args: {
    authSubject?: string | null;
    childRunId?: string | null;
    definition: Pick<ExternalAgentRouteDefinition, "agentType" | "endpointPath" | "operation">;
    handoffReason: string;
    parentRunId?: string | null;
    permissionDecision?: string | null;
    protocolVersion?: ExternalAgentProtocolVersion | null;
    requestId?: string | null;
    taskStatus?: string | null;
  },
) {
  return {
    ...baseMetadata,
    ...buildExternalAgentHandoffMetadata(args),
  };
}

export function withExternalRequestedOperation(
  definition: ExternalAgentRouteDefinition,
  operation: z.infer<typeof internalAgentOperationSchema>,
): ExternalAgentOperationDefinition {
  return {
    ...definition,
    operation,
  };
}

export function assertExternalA2AEnvelopeIdentity(args: {
  caller: ExternalAgentCaller;
  correlationId: string;
  definition: Pick<ExternalAgentOperationDefinition, "agentType" | "endpointPath" | "operation">;
  parsedRequest: Pick<
    ExternalAgentParsedRequest<unknown>,
    "auth" | "receiverAgentId" | "requestId" | "senderAgentId"
  >;
}): ExternalAgentProtocolResolution {
  const senderParticipant = resolveA2AProtocolParticipant(args.parsedRequest.senderAgentId);
  const receiverParticipant = getA2AProtocolParticipantForAgent(args.definition.agentType);

  if (!senderParticipant) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The senderAgentId is not registered for A2A dispatch.",
      details: {
        senderAgentId: args.parsedRequest.senderAgentId,
      },
      correlationId: args.correlationId,
    });
  }

  if (args.parsedRequest.receiverAgentId !== receiverParticipant.agentId) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The receiverAgentId does not match the target agent route.",
      details: {
        expectedReceiverAgentId: receiverParticipant.agentId,
        receiverAgentId: args.parsedRequest.receiverAgentId,
      },
      correlationId: args.correlationId,
    });
  }

  if (
    args.parsedRequest.auth?.authenticatedSenderId &&
    args.parsedRequest.auth.authenticatedSenderId !== args.parsedRequest.senderAgentId
  ) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The authenticated sender identity does not match senderAgentId.",
      details: {
        authenticatedSenderId: args.parsedRequest.auth.authenticatedSenderId,
        senderAgentId: args.parsedRequest.senderAgentId,
      },
      correlationId: args.correlationId,
    });
  }

  if (
    args.parsedRequest.auth?.serviceName &&
    args.parsedRequest.auth.serviceName !== args.caller.identity.serviceName
  ) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The protocol auth metadata does not match the authenticated calling service.",
      details: {
        authenticatedServiceName: args.caller.identity.serviceName,
        protocolServiceName: args.parsedRequest.auth.serviceName,
      },
      correlationId: args.correlationId,
    });
  }

  if (senderParticipant.authSubject !== args.caller.identity.id) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The senderAgentId is not authorized for the authenticated caller.",
      details: {
        authenticatedSubject: args.caller.identity.id,
        senderAgentId: args.parsedRequest.senderAgentId,
      },
      correlationId: args.correlationId,
    });
  }

  return {
    receiverParticipant,
    senderParticipant,
  };
}

export function buildExternalA2AProtocolContext(args: {
  completedAt?: string | null;
  definition: Pick<ExternalAgentOperationDefinition, "endpointPath" | "operation">;
  handoffId?: string | null;
  handoffMetadata?: Record<string, unknown>;
  handoffStatus?: A2AProtocolContext["status"] | null;
  parsedRequest: ExternalAgentParsedRequest<unknown>;
  runId: string;
  status: A2AProtocolContext["status"];
}) {
  return {
    authJson: args.parsedRequest.auth ?? {},
    completedAt: args.completedAt ?? null,
    contextJson: args.parsedRequest.context ?? {},
    conversationId: args.parsedRequest.conversationId,
    deadlineAt: args.parsedRequest.deadline,
    handoffId: args.handoffId ?? null,
    handoffMetadata: args.handoffMetadata ?? {},
    handoffStatus: args.handoffStatus ?? null,
    handoffType: args.handoffId ? "external_a2a_dispatch" : null,
    idempotencyKey: args.parsedRequest.idempotencyKey,
    messageId: args.parsedRequest.messageId,
    operation: args.definition.operation,
    parentRunId: args.parsedRequest.parentRunId,
    payloadJson:
      args.parsedRequest.payload && typeof args.parsedRequest.payload === "object"
        ? (args.parsedRequest.payload as Record<string, unknown>)
        : {},
    protocolVersion: args.parsedRequest.protocolVersion,
    receiverAgentId: args.parsedRequest.receiverAgentId,
    replyTo: args.parsedRequest.replyTo,
    requestId: args.parsedRequest.requestId,
    runId: args.runId,
    senderAgentId: args.parsedRequest.senderAgentId,
    sentAt: args.parsedRequest.sentAt,
    sourceEndpoint:
      args.parsedRequest.context.sourceEndpoint ?? args.parsedRequest.replyTo ?? null,
    status: args.status,
    targetEndpoint: args.definition.endpointPath,
    taskType: args.parsedRequest.taskType,
    threadId: args.parsedRequest.threadId,
    traceId: args.parsedRequest.traceId,
  } satisfies A2AProtocolContext;
}

export async function emitExternalA2AProtocolEvent(args: {
  completedAt?: string | null;
  definition: Pick<ExternalAgentOperationDefinition, "endpointPath" | "operation">;
  eventName: string;
  handoffId?: string | null;
  handoffMetadata?: Record<string, unknown>;
  handoffStatus?: A2AProtocolContext["status"] | null;
  input?: unknown;
  output?: unknown;
  parsedRequest: ExternalAgentParsedRequest<unknown>;
  runId: string;
  spanName: string;
  status: A2AProtocolContext["status"];
  tags?: string[];
}) {
  return emitA2AProtocolEvent({
    eventName: args.eventName,
    input: args.input,
    output: args.output,
    protocolContext: buildExternalA2AProtocolContext({
      completedAt: args.completedAt,
      definition: args.definition,
      handoffId: args.handoffId,
      handoffMetadata: args.handoffMetadata,
      handoffStatus: args.handoffStatus,
      parsedRequest: args.parsedRequest,
      runId: args.runId,
      status: args.status,
    }),
    spanName: args.spanName,
    tags: ["external_a2a", ...(args.tags ?? [])],
  });
}

function applyExternalA2AHeaders(args: {
  response: Response;
  agentType?: InternalAgentRole | null;
  quota: InternalAgentQuotaMetadata | null;
}) {
  args.response.headers.set("x-a2a-protocol-version", "a2a.v1");

  if (args.agentType) {
    args.response.headers.set("x-a2a-agent-type", args.agentType);
  }

  if (args.quota) {
    args.response.headers.set("x-rate-limit-limit", String(args.quota.limit));
    args.response.headers.set("x-rate-limit-remaining", String(args.quota.remaining));
    args.response.headers.set(
      "x-rate-limit-reset",
      String(Math.max(0, Math.ceil((new Date(args.quota.resetAt).getTime() - Date.now()) / 1000))),
    );
    args.response.headers.set(
      "retry-after",
      String(Math.max(0, Math.ceil((new Date(args.quota.resetAt).getTime() - Date.now()) / 1000))),
    );
  }

  return args.response;
}

function logExternalA2AAuditEvent(args: {
  actorId?: string | null;
  correlationId: string;
  eventType: string;
  metadataJson?: Record<string, unknown>;
  requestId: string;
  runId?: string | null;
  serviceName?: string | null;
  targetId: string;
  targetType: string;
}) {
  logAuditEvent({
    actorId: args.actorId ?? "anonymous_external_agent",
    actorType: "system_service",
    correlationId: args.correlationId,
    eventType: args.eventType,
    metadataJson: {
      request_id: args.requestId,
      service_name: args.serviceName ?? null,
      ...(args.metadataJson ?? {}),
    },
    runId: args.runId ?? null,
    targetId: args.targetId,
    targetType: args.targetType,
  });
}

function parseExternalAgentEnvelope<TPayload>(args: {
  body: unknown;
  definition: ExternalAgentRouteDefinition;
  fallbackRequestId: string;
}) {
  const envelopeSchema =
    args.definition.agentType === "candidate"
      ? externalCandidateAgentRequestSchema
      : args.definition.agentType === "recruiter"
        ? externalRecruiterAgentRequestSchema
        : externalVerifierAgentRequestSchema;
  const envelope = envelopeSchema.parse(args.body);

  return {
    agentType: envelope.agentType,
    auth: envelope.auth,
    context: envelope.context,
    conversationId: envelope.conversationId,
    deadline: envelope.deadline,
    idempotencyKey: envelope.idempotencyKey,
    messageId: envelope.messageId,
    metadata: envelope.metadata,
    operation: envelope.operation,
    parentRunId: envelope.parentRunId,
    payload: envelope.payload as TPayload,
    protocolVersion: envelope.protocolVersion,
    receiverAgentId: envelope.receiverAgentId,
    replyTo: envelope.replyTo,
    requestId: envelope.requestId ?? args.fallbackRequestId,
    senderAgentId: envelope.senderAgentId,
    sentAt: envelope.sentAt,
    taskType: envelope.taskType,
    threadId: envelope.threadId,
    traceId: envelope.traceId,
    version: envelope.version,
  } satisfies ExternalAgentParsedRequest<TPayload>;
}

function assertExternalA2ARateLimit(args: {
  agentType: InternalAgentRole | null;
  caller: ExternalAgentCaller;
  correlationId: string;
  requestId: string;
  resource: string;
  runId?: string | null;
  targetId: string;
  targetType: string;
}) {
  const quotaResult = consumeExternalA2AQuota({
    agentType: args.agentType,
    callerId: args.caller.actorId,
    callerName: args.caller.identity.serviceName,
    resource: args.resource,
  });

  if (quotaResult.allowed) {
    return quotaResult.quota;
  }

  logExternalA2AAuditEvent({
    actorId: args.caller.actorId,
    correlationId: args.correlationId,
    eventType: "security.external_a2a.rate_limited",
    metadataJson: args.agentType
      ? buildExternalAgentAuditMetadata(
          {
            agent_type: args.agentType,
            quota: quotaResult.quota,
            resource: args.resource,
          },
          {
            authSubject: args.caller.identity.id,
            definition: {
              agentType: args.agentType,
              endpointPath: typeof args.targetId === "string" ? `/api/a2a/agents/${args.agentType}` : "",
              operation: "respond",
            },
            handoffReason: "rate_limited",
            parentRunId: args.runId ?? null,
            permissionDecision: "denied",
            taskStatus: "denied",
          },
        )
      : {
          agent_type: args.agentType,
          quota: quotaResult.quota,
          resource: args.resource,
        },
    requestId: args.requestId,
    runId: args.runId ?? null,
    serviceName: args.caller.identity.serviceName,
    targetId: args.targetId,
    targetType: args.targetType,
  });

  if (args.agentType) {
    emitAgentHandoffEvent({
      event: "denied",
      metadata: {
        a2aProtocolVersion: "a2a.v1",
        a2aRequestId: args.requestId,
        authSubject: args.caller.identity.id,
        handoffReason: "rate_limited",
        handoffType: "external_a2a_dispatch",
        operation: "respond",
        parentRunId: args.runId ?? null,
        permissionDecision: "denied",
        targetAgentType: args.agentType,
        targetEndpoint: `/api/a2a/agents/${args.agentType}`,
        taskStatus: "denied",
      },
      output: {
        quota: quotaResult.quota,
        request_id: args.requestId,
        status: 429,
      },
      tags: ["external_a2a"],
    });
  }

  throw new ApiError({
    errorCode: "RATE_LIMITED",
    status: 429,
    message: "External agent request rate limit exceeded.",
    details: {
      agentType: args.agentType,
      quota: quotaResult.quota,
      resource: args.resource,
      serviceName: args.caller.identity.serviceName,
    },
    correlationId: args.correlationId,
  });
}

export async function resolveExternalAgentRouteContext(
  request: Request,
  agentType: InternalAgentRole,
) {
  const correlationId = getCorrelationId(request.headers);
  assertExternalA2AEnabled(correlationId);

  const caller = resolveVerifiedExternalAgentCaller({
    agentType,
    correlationId,
    request,
  });
  const definition = getExternalAgentRouteDefinition(agentType);
  const runContext = createRunContext({
    correlationId,
  });
  const fallbackRequestId = getRequestTraceContext()?.requestId ?? crypto.randomUUID();

  updateRequestTraceContext({
    actorType: caller.actorType,
    ownerId: caller.actorId,
    runId: runContext.runId,
    sessionId: caller.actorId,
    userId: null,
  });

  return {
    caller,
    correlationId,
    definition,
    fallbackRequestId,
    runContext,
    startedAt: Date.now(),
  } satisfies ExternalAgentRouteContext;
}

export function emitExternalAgentRouteAcceptedEvents(args: {
  caller: ExternalAgentCaller;
  definition: Pick<ExternalAgentOperationDefinition, "agentType" | "endpointPath" | "operation">;
  requestId: string;
  runId: string;
  version: ExternalAgentProtocolVersion;
}) {
  emitAgentHandoffEvent({
    event: "start",
    metadata: {
      a2aProtocolVersion: args.version,
      a2aRequestId: args.requestId,
      authSubject: args.caller.identity.id,
      handoffReason: "external_a2a_request",
      handoffType: "external_a2a_dispatch",
      operation: args.definition.operation,
      parentRunId: args.runId,
      targetAgentType: args.definition.agentType,
      targetEndpoint: args.definition.endpointPath,
      taskStatus: "started",
    },
    output: {
      request_id: args.requestId,
    },
    tags: ["external_a2a"],
  });

  emitAgentHandoffEvent({
    event: "authz",
    metadata: {
      a2aProtocolVersion: args.version,
      a2aRequestId: args.requestId,
      authSubject: args.caller.identity.id,
      handoffReason: "external_caller_authorized",
      handoffType: "external_a2a_dispatch",
      operation: args.definition.operation,
      parentRunId: args.runId,
      permissionDecision: "allowed",
      targetAgentType: args.definition.agentType,
      targetEndpoint: args.definition.endpointPath,
    },
    output: {
      request_id: args.requestId,
    },
    tags: ["external_a2a"],
  });
}

export function resolveExternalDiscoveryContext(
  request: Request,
  agentType?: InternalAgentRole | null,
) {
  const correlationId = getCorrelationId(request.headers);
  assertExternalA2AEnabled(correlationId);

  const caller = resolveVerifiedExternalAgentCaller({
    agentType: agentType ?? null,
    correlationId,
    request,
  });
  const requestId = getRequestTraceContext()?.requestId ?? crypto.randomUUID();

  updateRequestTraceContext({
    actorType: caller.actorType,
    ownerId: caller.actorId,
    sessionId: caller.actorId,
    userId: null,
  });

  return {
    caller,
    correlationId,
    requestId,
  } satisfies ExternalDiscoveryContext;
}

export async function parseExternalAgentRequest<TPayload>(args: {
  definition: ExternalAgentRouteDefinition;
  fallbackRequestId: string;
  request: Request;
}) {
  let body: unknown;

  try {
    body = await args.request.json();
  } catch {
    throw new ApiError({
      errorCode: "INVALID_REQUEST",
      status: 400,
      message: "A valid JSON request body is required.",
      details: null,
      correlationId: getCorrelationId(args.request.headers),
    });
  }

  return parseExternalAgentEnvelope<TPayload>({
    body,
    definition: args.definition,
    fallbackRequestId: args.fallbackRequestId,
  });
}

export function reserveExternalAgentQuota(args: {
  caller: ExternalAgentCaller;
  correlationId: string;
  definition: ExternalAgentOperationDefinition;
  requestId: string;
  runId: string;
}) {
  return assertExternalA2ARateLimit({
    agentType: args.definition.agentType,
    caller: args.caller,
    correlationId: args.correlationId,
    requestId: args.requestId,
    resource: `${args.definition.agentType}:${args.definition.operation}`,
    runId: args.runId,
    targetId: args.definition.agentType,
    targetType: "external_agent",
  });
}

export function reserveExternalDiscoveryQuota(args: {
  agentType?: InternalAgentRole | null;
  caller: ExternalAgentCaller;
  correlationId: string;
  requestId: string;
  resource: string;
  targetId: string;
}) {
  return assertExternalA2ARateLimit({
    agentType: args.agentType ?? null,
    caller: args.caller,
    correlationId: args.correlationId,
    requestId: args.requestId,
    resource: args.resource,
    targetId: args.targetId,
    targetType: "external_agent_discovery",
  });
}

export function logExternalAgentRequestReceived(args: {
  caller: ExternalAgentCaller;
  correlationId: string;
  definition: ExternalAgentOperationDefinition;
  requestId: string;
  runId: string;
  version: ExternalAgentProtocolVersion;
}) {
  logExternalA2AAuditEvent({
    actorId: args.caller.actorId,
    correlationId: args.correlationId,
    eventType: "external.a2a.request.received",
    metadataJson: buildExternalAgentAuditMetadata(
      {
        agent_type: args.definition.agentType,
        operation: args.definition.operation,
        protocol_version: args.version,
      },
      {
        authSubject: args.caller.identity.id,
        definition: args.definition,
        handoffReason: "external_a2a_request",
        parentRunId: args.runId,
        permissionDecision: "allowed",
        protocolVersion: args.version,
        requestId: args.requestId,
        taskStatus: "started",
      },
    ),
    requestId: args.requestId,
    runId: args.runId,
    serviceName: args.caller.identity.serviceName,
    targetId: args.definition.agentType,
    targetType: "external_agent",
  });
}

export function logExternalDiscoveryReceived(args: {
  caller: ExternalAgentCaller;
  correlationId: string;
  eventType: "external.a2a.discovery.list.received" | "external.a2a.discovery.card.received";
  requestId: string;
  targetId: string;
}) {
  logExternalA2AAuditEvent({
    actorId: args.caller.actorId,
    correlationId: args.correlationId,
    eventType: args.eventType,
    requestId: args.requestId,
    serviceName: args.caller.identity.serviceName,
    targetId: args.targetId,
    targetType: "external_agent_discovery",
  });
}

export async function traceExternalAgentInvocation<TResult>(args: {
  childRunId: string;
  caller: ExternalAgentCaller;
  definition: ExternalAgentOperationDefinition;
  parentRunId: string;
  requestId: string;
  version: ExternalAgentProtocolVersion;
  invoke: () => Promise<TResult>;
}) {
  const startedAt = Date.now();

  const result = await traceAgentHandoff({
    event: "dispatch",
    input: {
      protocol_version: args.version,
      request_id: args.requestId,
    },
    invoke: () =>
      traceSpan(
        {
          metadata: {
            agent_type: args.definition.agentType,
            endpoint: args.definition.endpointPath,
            operation: args.definition.operation,
            protocol_version: args.version,
            request_id: args.requestId,
            service_actor_id: args.caller.identity.serviceActorId,
            service_name: args.caller.identity.serviceName,
          },
          metrics: () => ({
            duration_ms: Date.now() - startedAt,
          }),
          name: `external.a2a.agent.${args.definition.agentType}.${args.definition.operation}`,
          tags: [
            "external_a2a",
            `agent:${args.definition.agentType}`,
            `operation:${args.definition.operation}`,
            `service:${args.caller.identity.serviceName}`,
          ],
          type: "task",
        },
        args.invoke,
      ),
    metadata: {
      a2aProtocolVersion: args.version,
      a2aRequestId: args.requestId,
      authSubject: args.caller.identity.id,
      childRunId: args.childRunId,
      handoffReason: "external_a2a_request",
      handoffType: "external_a2a_dispatch",
      operation: args.definition.operation,
      parentRunId: args.parentRunId,
      permissionDecision: "allowed",
      targetAgentType: args.definition.agentType,
      targetEndpoint: args.definition.endpointPath,
      taskStatus: "running",
    },
    metrics: () => ({
      duration_ms: Date.now() - startedAt,
    }),
    output: (value: TResult) => ({
      request_id: args.requestId,
      stop_reason:
        value && typeof value === "object" && "stopReason" in (value as Record<string, unknown>)
          ? ((value as { stopReason?: string | null }).stopReason ?? null)
          : null,
    }),
    tags: ["external_a2a"],
    type: "task",
  });

  emitAgentHandoffEvent({
    event: "complete",
    metadata: {
      a2aProtocolVersion: args.version,
      a2aRequestId: args.requestId,
      authSubject: args.caller.identity.id,
      childRunId: args.childRunId,
      handoffReason: "external_a2a_request",
      handoffType: "external_a2a_dispatch",
      operation: args.definition.operation,
      parentRunId: args.parentRunId,
      permissionDecision: "allowed",
      targetAgentType: args.definition.agentType,
      targetEndpoint: args.definition.endpointPath,
      taskStatus: "completed",
    },
    output: {
      request_id: args.requestId,
      stop_reason:
        result && typeof result === "object" && "stopReason" in (result as Record<string, unknown>)
          ? ((result as { stopReason?: string | null }).stopReason ?? null)
          : null,
    },
    tags: ["external_a2a"],
  });

  return result;
}

export function createExternalAgentResponse(args: {
  caller: ExternalAgentCaller;
  correlationId: string;
  definition: ExternalAgentOperationDefinition;
  durationMs: number;
  artifacts?: unknown[];
  completedAt?: string;
  confidence?: number | null;
  errors?: ExternalAgentError[];
  nextActions?: unknown[];
  presentationSummary?: unknown;
  quota: InternalAgentQuotaMetadata | null;
  result?: unknown;
  requestId: string;
  receiverAgentId: string;
  runId: string;
  senderAgentId: string;
  messageId: string;
  status?: "success";
  taskStatus?: A2AProtocolContext["status"];
  traceId: string;
  stepsUsed?: number;
  stopReason?: InternalAgentStopReason;
  toolCallsUsed?: number;
  reply?: string;
}) {
  const completedAt = args.completedAt ?? new Date().toISOString();
  const result =
    args.result ??
    externalAgentResultSchema.parse({
      presentationSummary: args.presentationSummary ?? null,
      reply: args.reply ?? "",
      runId: args.runId,
      stepsUsed: args.stepsUsed ?? 0,
      stopReason: args.stopReason ?? "completed",
      toolCallsUsed: args.toolCallsUsed ?? 0,
    });
  const metadata = buildMetadata({
    callerServiceName: args.caller.identity.serviceName,
    correlationId: args.correlationId,
    durationMs: args.durationMs,
    endpoint: args.definition.endpointPath,
    quota: args.quota,
  });

  logExternalA2AAuditEvent({
    actorId: args.caller.actorId,
    correlationId: args.correlationId,
    eventType: "external.a2a.request.completed",
    metadataJson: buildExternalAgentAuditMetadata(
      {
        agent_type: args.definition.agentType,
        duration_ms: args.durationMs,
        operation: args.definition.operation,
        status: "ok",
        stop_reason: args.stopReason,
        tool_calls_used: args.toolCallsUsed,
      },
      {
        authSubject: args.caller.identity.id,
        childRunId: args.runId,
        definition: args.definition,
        handoffReason: "external_a2a_request",
        parentRunId: args.runId,
        permissionDecision: "allowed",
        protocolVersion: "a2a.v1",
        requestId: args.requestId,
        taskStatus: "completed",
      },
    ),
    requestId: args.requestId,
    runId: args.runId,
    serviceName: args.caller.identity.serviceName,
    targetId: args.definition.agentType,
    targetType: "external_agent",
  });

  const response = applyTraceResponseHeaders(
    successResponse(
      externalAgentSuccessResponseSchema.parse({
        agentType: args.definition.agentType,
        artifacts: args.artifacts ?? [],
        completedAt,
        confidence: args.confidence ?? null,
        error: null,
        errors: args.errors ?? [],
        messageId: args.messageId,
        metadata,
        nextActions: args.nextActions ?? [],
        ok: true,
        operation: args.definition.operation,
        protocolVersion: "a2a.v1",
        receiverAgentId: args.receiverAgentId,
        requestId: args.requestId,
        result,
        runId: args.runId,
        senderAgentId: args.senderAgentId,
        status: args.status ?? "success",
        taskStatus: args.taskStatus ?? "completed",
        traceId: args.traceId,
        version: "a2a.v1",
      }),
      args.correlationId,
    ),
  );

  return applyExternalA2AHeaders({
    agentType: args.definition.agentType,
    quota: args.quota,
    response,
  });
}

export function createExternalAgentErrorResponse(args: {
  childRunId?: string | null;
  caller?: ExternalAgentCaller | null;
  correlationId: string;
  definition: ExternalAgentOperationDefinition;
  durationMs: number;
  error: unknown;
  messageId?: string | null;
  parsedRequest?: ExternalAgentParsedRequest<unknown> | null;
  quota?: InternalAgentQuotaMetadata | null;
  requestId: string;
  runId?: string | null;
}) {
  const apiError = toApiError(args.error, args.correlationId);
  const derivedQuota =
    !args.quota &&
    apiError.details &&
    typeof apiError.details === "object" &&
    !Array.isArray(apiError.details) &&
    "quota" in apiError.details
      ? (apiError.details.quota as InternalAgentQuotaMetadata | null)
      : null;
  const normalizedError = {
    code: apiError.errorCode,
    correlationId: apiError.correlationId,
    details: apiError.details,
    message: apiError.message,
    requestId: args.requestId,
    retryable: isRetryableErrorCode(apiError.errorCode),
  } satisfies ExternalAgentError;
  const metadata = buildMetadata({
    callerServiceName: args.caller?.identity.serviceName ?? null,
    correlationId: apiError.correlationId,
    durationMs: args.durationMs,
    endpoint: args.definition.endpointPath,
    quota: args.quota ?? derivedQuota,
  });
  const senderAgentId =
    getA2AProtocolParticipantForAgent(args.definition.agentType).agentId;
  const receiverAgentId =
    args.parsedRequest?.senderAgentId ??
    resolveA2AProtocolParticipant("careerai.gateway.employer_search")?.agentId ??
    "careerai.gateway.employer_search";
  const traceId = args.parsedRequest?.traceId ?? getRequestTraceContext()?.traceId ?? args.requestId;
  const messageId = args.parsedRequest?.messageId ?? args.messageId ?? args.requestId;
  const completedAt = new Date().toISOString();

  if (args.caller) {
    logExternalA2AAuditEvent({
      actorId: args.caller.actorId,
      correlationId: apiError.correlationId,
      eventType: "external.a2a.request.failed",
      metadataJson: buildExternalAgentAuditMetadata(
        {
          agent_type: args.definition.agentType,
          duration_ms: args.durationMs,
          error_code: apiError.errorCode,
          operation: args.definition.operation,
          status: "error",
        },
        {
          authSubject: args.caller.identity.id,
          childRunId: args.childRunId ?? null,
          definition: args.definition,
          handoffReason: apiError.errorCode.toLowerCase(),
          parentRunId: args.parsedRequest?.parentRunId ?? null,
          permissionDecision:
            apiError.status === 401 || apiError.status === 403 || apiError.status === 429
              ? "denied"
              : "allowed",
          protocolVersion: "a2a.v1",
          requestId: args.requestId,
          taskStatus: apiError.status >= 500 ? "failed" : "denied",
        },
      ),
      requestId: args.requestId,
      runId: args.runId ?? null,
      serviceName: args.caller.identity.serviceName,
      targetId: args.definition.agentType,
      targetType: "external_agent",
    });
  }

  const response = applyTraceResponseHeaders(
    NextResponse.json(
      externalAgentErrorResponseSchema.parse({
        agentType: args.definition.agentType,
        artifacts: [],
        completedAt,
        error: normalizedError,
        errors: [normalizedError],
        messageId,
        metadata,
        nextActions: [],
        ok: false,
        operation: args.definition.operation,
        protocolVersion: "a2a.v1",
        receiverAgentId,
        requestId: args.requestId,
        result: null,
        runId: args.childRunId ?? args.runId ?? args.requestId,
        senderAgentId,
        status: "error",
        taskStatus: "failed",
        traceId,
        version: "a2a.v1",
      }),
      {
        status: apiError.status,
        headers: {
          "x-correlation-id": apiError.correlationId,
        },
      },
    ),
  );

  return applyExternalA2AHeaders({
    agentType: args.definition.agentType,
    quota: args.quota ?? derivedQuota,
    response,
  });
}

export function createExternalDiscoveryListResponse(args: {
  caller: ExternalAgentCaller;
  correlationId: string;
  quota: InternalAgentQuotaMetadata | null;
  request: Request;
  requestId: string;
  visibleAgentTypes: InternalAgentRole[];
}) {
  const cards = args.visibleAgentTypes.map((agentType) =>
    getExternalAgentCard(agentType, {
      baseUrl: getBaseUrl(args.request),
    }),
  );

  logExternalA2AAuditEvent({
    actorId: args.caller.actorId,
    correlationId: args.correlationId,
    eventType: "external.a2a.discovery.list.completed",
    metadataJson: {
      visible_agent_count: cards.length,
    },
    requestId: args.requestId,
    serviceName: args.caller.identity.serviceName,
    targetId: "external_agent_list",
    targetType: "external_agent_discovery",
  });

  const response = applyTraceResponseHeaders(
    successResponse(
      externalAgentDiscoveryResponseSchema.parse({
        agents: cards,
        metadata: {
          correlationId: args.correlationId,
          requestId: args.requestId,
        },
        protocolVersion: "a2a.v1",
        version: "a2a.v1",
      }),
      args.correlationId,
    ),
  );

  return applyExternalA2AHeaders({
    quota: args.quota,
    response,
  });
}

export function createExternalAgentCardResponse(args: {
  agentType: InternalAgentRole;
  caller: ExternalAgentCaller;
  correlationId: string;
  quota: InternalAgentQuotaMetadata | null;
  request: Request;
  requestId: string;
}) {
  const card = getExternalAgentCard(args.agentType, {
    baseUrl: getBaseUrl(args.request),
  });

  logExternalA2AAuditEvent({
    actorId: args.caller.actorId,
    correlationId: args.correlationId,
    eventType: "external.a2a.discovery.card.completed",
    metadataJson: {
      agent_type: args.agentType,
    },
    requestId: args.requestId,
    serviceName: args.caller.identity.serviceName,
    targetId: args.agentType,
    targetType: "external_agent_discovery",
  });

  const response = applyTraceResponseHeaders(
    successResponse(
      externalAgentCardResponseSchema.parse({
        card,
        metadata: {
          correlationId: args.correlationId,
          requestId: args.requestId,
        },
        protocolVersion: "a2a.v1",
        version: "a2a.v1",
      }),
      args.correlationId,
    ),
  );

  return applyExternalA2AHeaders({
    agentType: args.agentType,
    quota: args.quota,
    response,
  });
}

export function createExternalDiscoveryErrorResponse(args: {
  correlationId: string;
  error: unknown;
  quota?: InternalAgentQuotaMetadata | null;
}) {
  const apiError = toApiError(args.error, args.correlationId);
  const derivedQuota =
    !args.quota &&
    apiError.details &&
    typeof apiError.details === "object" &&
    !Array.isArray(apiError.details) &&
    "quota" in apiError.details
      ? (apiError.details.quota as InternalAgentQuotaMetadata | null)
      : null;
  const response = applyTraceResponseHeaders(errorResponse(apiError, args.correlationId));

  return applyExternalA2AHeaders({
    quota: args.quota ?? derivedQuota,
    response,
  });
}
