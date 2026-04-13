import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
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
  externalAgentDiscoveryResponseSchema,
  externalAgentErrorResponseSchema,
  externalAgentRequestMetadataSchema,
  externalAgentResponseMetadataSchema,
  externalAgentResultSchema,
  externalAgentSuccessResponseSchema,
  externalCandidateAgentRequestSchema,
  externalRecruiterAgentRequestSchema,
  externalVerifierAgentRequestSchema,
  type ExternalAgentError,
  type ExternalAgentProtocolVersion,
  type InternalAgentQuotaMetadata,
  type InternalAgentRole,
  type InternalAgentStopReason,
} from "@/packages/contracts/src";

type ExternalAgentParsedRequest<TPayload> = {
  agentType: InternalAgentRole;
  metadata: z.infer<typeof externalAgentRequestMetadataSchema>;
  operation: "respond";
  payload: TPayload;
  requestId: string;
  version: ExternalAgentProtocolVersion;
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
    metadata: envelope.metadata,
    operation: envelope.operation,
    payload: envelope.payload as TPayload,
    requestId: envelope.requestId ?? args.fallbackRequestId,
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
    metadataJson: {
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
  definition: ExternalAgentRouteDefinition;
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
  definition: ExternalAgentRouteDefinition;
  requestId: string;
  runId: string;
  version: ExternalAgentProtocolVersion;
}) {
  logExternalA2AAuditEvent({
    actorId: args.caller.actorId,
    correlationId: args.correlationId,
    eventType: "external.a2a.request.received",
    metadataJson: {
      agent_type: args.definition.agentType,
      operation: args.definition.operation,
      protocol_version: args.version,
    },
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

export async function traceExternalAgentInvocation<TResult extends { stopReason?: string }>(args: {
  caller: ExternalAgentCaller;
  definition: ExternalAgentRouteDefinition;
  requestId: string;
  version: ExternalAgentProtocolVersion;
  invoke: () => Promise<TResult>;
}) {
  const startedAt = Date.now();

  return traceSpan(
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
  );
}

export function createExternalAgentResponse(args: {
  caller: ExternalAgentCaller;
  correlationId: string;
  definition: ExternalAgentRouteDefinition;
  durationMs: number;
  presentationSummary?: unknown;
  quota: InternalAgentQuotaMetadata | null;
  requestId: string;
  runId: string;
  stepsUsed: number;
  stopReason: InternalAgentStopReason;
  toolCallsUsed: number;
  reply: string;
}) {
  const result = externalAgentResultSchema.parse({
    presentationSummary: args.presentationSummary ?? null,
    reply: args.reply,
    runId: args.runId,
    stepsUsed: args.stepsUsed,
    stopReason: args.stopReason,
    toolCallsUsed: args.toolCallsUsed,
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
    metadataJson: {
      agent_type: args.definition.agentType,
      duration_ms: args.durationMs,
      operation: args.definition.operation,
      status: "ok",
      stop_reason: args.stopReason,
      tool_calls_used: args.toolCallsUsed,
    },
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
        error: null,
        metadata,
        ok: true,
        operation: args.definition.operation,
        requestId: args.requestId,
        result,
        taskStatus: "completed",
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
  caller?: ExternalAgentCaller | null;
  correlationId: string;
  definition: ExternalAgentRouteDefinition;
  durationMs: number;
  error: unknown;
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

  if (args.caller) {
    logExternalA2AAuditEvent({
      actorId: args.caller.actorId,
      correlationId: apiError.correlationId,
      eventType: "external.a2a.request.failed",
      metadataJson: {
        agent_type: args.definition.agentType,
        duration_ms: args.durationMs,
        error_code: apiError.errorCode,
        operation: args.definition.operation,
        status: "error",
      },
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
        error: normalizedError,
        metadata,
        ok: false,
        operation: args.definition.operation,
        requestId: args.requestId,
        result: null,
        taskStatus: "failed",
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
