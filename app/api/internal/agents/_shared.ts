import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import type { AuthenticatedActorIdentity, InternalServiceActorIdentity } from "@/actor-identity";
import { createInternalServiceActorIdentity } from "@/actor-identity";
import {
  buildAgentHandoffMetadata,
  emitAgentHandoffEvent,
  traceAgentHandoff,
} from "@/lib/agent-handoff-tracing";
import {
  applyTraceResponseHeaders,
  getRequestTraceContext,
  traceSpan,
  updateRequestTraceContext,
} from "@/lib/tracing";
import { getInternalAgentRouteDefinition, type InternalAgentRouteDefinition } from "@/lib/internal-agents/registry";
import { consumeInternalAgentQuota } from "@/lib/internal-agents/rate-limit";
import {
  createAgentContext,
  createChildRunContext,
  createRunContext,
  loadAgentOrganizationContext,
  type AgentContext,
  type AgentOrganizationContext,
  type RunContext,
} from "@/packages/agent-runtime/src";
import {
  assertAllowedActorTypes,
  getCorrelationId,
  logAuditEvent,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import {
  ApiError,
  candidateAgentEnvelopeSchema,
  internalAgentErrorResponseSchema,
  internalAgentRequestMetadataSchema,
  internalAgentResponseMetadataSchema,
  internalAgentResponseSchema,
  internalAgentSuccessResponseSchema,
  recruiterAgentEnvelopeSchema,
  verifierAgentEnvelopeSchema,
  type CandidateAgentEnvelope,
  type InternalAgentError,
  type InternalAgentQuotaMetadata,
  type InternalAgentRole,
  type InternalAgentSchemaVersion,
  type InternalAgentStopReason,
  type RecruiterAgentEnvelope,
  type VerifierAgentEnvelope,
} from "@/packages/contracts/src";
import {
  findPersistentContextByTalentIdentityId,
  findPersistentContextByUserId,
  type PersistentTalentIdentityContext,
} from "@/packages/persistence/src";

type InternalAgentEnvelope =
  | CandidateAgentEnvelope
  | RecruiterAgentEnvelope
  | VerifierAgentEnvelope;

type InternalAgentParsedRequest<TPayload> = {
  agentType: InternalAgentRole;
  metadata: InternalAgentEnvelope["metadata"];
  operation: InternalAgentEnvelope["operation"];
  payload: TPayload;
  requestId: string;
  version: InternalAgentSchemaVersion;
};

type InternalAgentRouteContext = {
  correlationId: string;
  definition: InternalAgentRouteDefinition;
  fallbackRequestId: string;
  runContext: RunContext;
  serviceActor: InternalServiceActorIdentity;
  startedAt: number;
};

function createAuthenticatedAgentIdentity(
  context: PersistentTalentIdentityContext,
): AuthenticatedActorIdentity {
  return {
    appUserId: context.user.id,
    authProvider: context.user.authProvider ?? null,
    authSource: "nextauth_session",
    email: context.user.email ?? null,
    id: `user:${context.aggregate.talentIdentity.id}`,
    kind: "authenticated_user",
    name: context.user.fullName || context.aggregate.talentIdentity.display_name,
    preferredPersona: context.user.preferredPersona ?? "job_seeker",
    providerUserId: context.user.providerUserId ?? null,
    roleType: context.onboarding.roleType ?? null,
    talentIdentityId: context.aggregate.talentIdentity.id,
  };
}

function selectOrganizationContext(
  correlationId: string,
  organizationContext: AgentOrganizationContext | null,
  organizationId?: string | null,
) {
  if (!organizationContext || !organizationId) {
    return organizationContext;
  }

  const selectedMembership = organizationContext.memberships.find(
    (membership) => membership.organizationId === organizationId,
  );

  if (!selectedMembership) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The recruiter does not have access to the requested organization context.",
      details: {
        organizationId,
      },
      correlationId,
    });
  }

  return {
    ...organizationContext,
    primaryOrganization: selectedMembership,
  };
}

function splitEnvList(value: string | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return [];
  }

  return normalizedValue
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getAllowedServiceNames(agentType: InternalAgentRole) {
  const scopedKey = `INTERNAL_AGENT_${agentType.toUpperCase()}_ALLOWED_SERVICES`;
  const scopedValues = splitEnvList(process.env[scopedKey]);

  if (scopedValues.length > 0) {
    return scopedValues;
  }

  const globalValues = splitEnvList(process.env.INTERNAL_AGENT_ALLOWED_SERVICES);
  return globalValues.length > 0 ? globalValues : null;
}

function isRetryableErrorCode(code: InternalAgentError["code"]) {
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

  return internalAgentResponseMetadataSchema.parse({
    callerServiceName: args.callerServiceName,
    correlationId: args.correlationId,
    durationMs: args.durationMs,
    endpoint: args.endpoint,
    quota: args.quota,
    traceId: traceContext?.traceId ?? null,
  });
}

function buildInternalAgentHandoffMetadata(args: {
  authSubject?: string | null;
  childRunId?: string | null;
  definition: Pick<InternalAgentRouteDefinition, "agentType" | "endpoint" | "operation">;
  handoffReason: string;
  parentRunId?: string | null;
  permissionDecision?: string | null;
  requestId?: string | null;
  schemaVersion?: InternalAgentSchemaVersion | null;
  taskStatus?: string | null;
}) {
  return buildAgentHandoffMetadata({
    authSubject: args.authSubject ?? null,
    childRunId: args.childRunId ?? null,
    handoffReason: args.handoffReason,
    handoffType: "internal_agent_dispatch",
    operation: args.definition.operation,
    parentRunId: args.parentRunId ?? null,
    permissionDecision: args.permissionDecision ?? null,
    targetAgentType: args.definition.agentType,
    targetEndpoint: args.definition.endpoint,
    taskStatus: args.taskStatus ?? null,
  });
}

function buildInternalAgentAuditMetadata(
  baseMetadata: Record<string, unknown>,
  args: {
    authSubject?: string | null;
    childRunId?: string | null;
    definition: Pick<InternalAgentRouteDefinition, "agentType" | "endpoint" | "operation">;
    handoffReason: string;
    parentRunId?: string | null;
    permissionDecision?: string | null;
    taskStatus?: string | null;
  },
) {
  return {
    ...baseMetadata,
    ...buildInternalAgentHandoffMetadata(args),
  };
}

function applyInternalAgentHeaders(args: {
  response: Response;
  agentType: InternalAgentRole;
  quota: InternalAgentQuotaMetadata | null;
}) {
  args.response.headers.set("x-agent-contract-version", "v1");
  args.response.headers.set("x-internal-agent-type", args.agentType);

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

function parseInternalAgentEnvelope<TPayload>(args: {
  body: unknown;
  definition: InternalAgentRouteDefinition;
  fallbackRequestId: string;
  legacySchema: z.ZodType<TPayload>;
}) {
  const envelopeSchema =
    args.definition.agentType === "candidate"
      ? candidateAgentEnvelopeSchema
      : args.definition.agentType === "recruiter"
        ? recruiterAgentEnvelopeSchema
        : verifierAgentEnvelopeSchema;

  const looksVersioned =
    Boolean(args.body) &&
    typeof args.body === "object" &&
    ("version" in (args.body as Record<string, unknown>) ||
      "payload" in (args.body as Record<string, unknown>) ||
      "agentType" in (args.body as Record<string, unknown>) ||
      "operation" in (args.body as Record<string, unknown>));

  if (looksVersioned) {
    const envelope = envelopeSchema.parse(args.body);

    return {
      agentType: envelope.agentType,
      metadata: envelope.metadata,
      operation: envelope.operation,
      payload: envelope.payload as TPayload,
      requestId: envelope.requestId ?? args.fallbackRequestId,
      version: envelope.version,
    } satisfies InternalAgentParsedRequest<TPayload>;
  }

  const payload = args.legacySchema.parse(args.body);

  return {
    agentType: args.definition.agentType,
    metadata: internalAgentRequestMetadataSchema.parse({}),
    operation: args.definition.operation,
    payload,
    requestId: args.fallbackRequestId,
    version: "v1",
  } satisfies InternalAgentParsedRequest<TPayload>;
}

function logInternalAgentAuditEvent(args: {
  correlationId: string;
  eventType: string;
  metadataJson?: Record<string, unknown>;
  requestId: string;
  runId?: string | null;
  serviceActor: InternalServiceActorIdentity;
  targetId: string;
  targetType: string;
}) {
  logAuditEvent({
    actorId: args.serviceActor.serviceActorId,
    actorType: "system_service",
    correlationId: args.correlationId,
    eventType: args.eventType,
    metadataJson: {
      request_id: args.requestId,
      service_name: args.serviceActor.serviceName,
      ...(args.metadataJson ?? {}),
    },
    runId: args.runId ?? null,
    targetId: args.targetId,
    targetType: args.targetType,
  });
}

function assertInternalAgentServiceAccess(args: {
  correlationId: string;
  definition: InternalAgentRouteDefinition;
  requestId: string;
  runId: string;
  serviceActor: InternalServiceActorIdentity;
}) {
  const allowedServiceNames = getAllowedServiceNames(args.definition.agentType);

  if (
    !allowedServiceNames ||
    allowedServiceNames.includes(args.serviceActor.serviceName) ||
    allowedServiceNames.includes(args.serviceActor.serviceActorId)
  ) {
    return;
  }

  logInternalAgentAuditEvent({
    correlationId: args.correlationId,
    eventType: "security.internal_agent.auth.denied",
    metadataJson: buildInternalAgentAuditMetadata(
      {
        agent_type: args.definition.agentType,
        operation: args.definition.operation,
        reason: "service_not_allowed_for_agent",
      },
      {
        authSubject: args.serviceActor.id,
        definition: args.definition,
        handoffReason: "service_not_allowed_for_agent",
        parentRunId: args.runId,
        permissionDecision: "denied",
        taskStatus: "denied",
      },
    ),
    requestId: args.requestId,
    runId: args.runId,
    serviceActor: args.serviceActor,
    targetId: args.definition.agentType,
    targetType: "internal_agent",
  });

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "The authenticated internal service is not allowed to invoke this agent endpoint.",
    details: {
      agentType: args.definition.agentType,
      serviceName: args.serviceActor.serviceName,
    },
    correlationId: args.correlationId,
  });
}

function assertInternalAgentRateLimit(args: {
  correlationId: string;
  definition: InternalAgentRouteDefinition;
  requestId: string;
  runId: string;
  serviceActor: InternalServiceActorIdentity;
}) {
  const quotaResult = consumeInternalAgentQuota({
    agentType: args.definition.agentType,
    operation: args.definition.operation,
    serviceActorId: args.serviceActor.serviceActorId,
    serviceName: args.serviceActor.serviceName,
  });

  if (quotaResult.allowed) {
    return quotaResult.quota;
  }

  logInternalAgentAuditEvent({
    correlationId: args.correlationId,
    eventType: "security.internal_agent.rate_limited",
    metadataJson: buildInternalAgentAuditMetadata(
      {
        agent_type: args.definition.agentType,
        operation: args.definition.operation,
        quota: quotaResult.quota,
      },
      {
        authSubject: args.serviceActor.id,
        definition: args.definition,
        handoffReason: "rate_limited",
        parentRunId: args.runId,
        permissionDecision: "denied",
        taskStatus: "denied",
      },
    ),
    requestId: args.requestId,
    runId: args.runId,
    serviceActor: args.serviceActor,
    targetId: args.definition.agentType,
    targetType: "internal_agent",
  });

  emitAgentHandoffEvent({
    event: "denied",
    metadata: {
      authSubject: args.serviceActor.id,
      handoffReason: "rate_limited",
      handoffType: "internal_agent_dispatch",
      operation: args.definition.operation,
      parentRunId: args.runId,
      permissionDecision: "denied",
      targetAgentType: args.definition.agentType,
      targetEndpoint: args.definition.endpoint,
      taskStatus: "denied",
    },
    output: {
      quota: quotaResult.quota,
      request_id: args.requestId,
      status: 429,
    },
    tags: ["internal_agent"],
  });

  throw new ApiError({
    errorCode: "RATE_LIMITED",
    status: 429,
    message: "Internal agent request rate limit exceeded.",
    details: {
      agentType: args.definition.agentType,
      operation: args.definition.operation,
      quota: quotaResult.quota,
      serviceName: args.serviceActor.serviceName,
    },
    correlationId: args.correlationId,
  });
}

export async function resolveInternalAgentRouteContext(
  request: Request,
  agentType: InternalAgentRole,
) {
  const definition = getInternalAgentRouteDefinition(agentType);
  const correlationId = getCorrelationId(request.headers);
  const fallbackRequestId = getRequestTraceContext()?.requestId ?? crypto.randomUUID();
  let actor:
    | Awaited<ReturnType<typeof resolveVerifiedActor>>
    | null = null;

  try {
    actor = await resolveVerifiedActor(request, correlationId);

    assertAllowedActorTypes(actor, ["system_service"], correlationId, definition.action);

    if (actor.identity?.kind !== "internal_service") {
      throw new ApiError({
        errorCode: "FORBIDDEN",
        status: 403,
        message: "Internal agent endpoints require verified internal-service credentials.",
        details: null,
        correlationId,
      });
    }

    const runContext = createRunContext({
      correlationId,
    });

    updateRequestTraceContext({
      actorType: actor.actorType,
      ownerId: actor.actorId,
      runId: runContext.runId,
      sessionId: actor.actorId,
      userId: null,
    });

    emitAgentHandoffEvent({
      event: "start",
      metadata: {
        authSubject: actor.identity.id,
        handoffReason: "internal_service_request",
        handoffType: "internal_agent_dispatch",
        operation: definition.operation,
        parentRunId: runContext.runId,
        targetAgentType: definition.agentType,
        targetEndpoint: definition.endpoint,
        taskStatus: "started",
      },
      output: {
        request_id: fallbackRequestId,
        schema_version: "v1",
      },
      tags: ["internal_agent"],
    });

    assertInternalAgentServiceAccess({
      correlationId,
      definition,
      requestId: fallbackRequestId,
      runId: runContext.runId,
      serviceActor: actor.identity,
    });

    emitAgentHandoffEvent({
      event: "authz",
      metadata: {
        authSubject: actor.identity.id,
        handoffReason: "service_allowed_for_agent",
        handoffType: "internal_agent_dispatch",
        operation: definition.operation,
        parentRunId: runContext.runId,
        permissionDecision: "allowed",
        targetAgentType: definition.agentType,
        targetEndpoint: definition.endpoint,
      },
      output: {
        request_id: fallbackRequestId,
      },
      tags: ["internal_agent"],
    });

    return {
      correlationId,
      definition,
      fallbackRequestId,
      runContext,
      serviceActor: actor.identity,
      startedAt: Date.now(),
    } satisfies InternalAgentRouteContext;
  } catch (error) {
    const apiError = toApiError(error, correlationId);
    const internalServiceActor =
      actor?.identity?.kind === "internal_service" ? actor.identity : null;

    emitAgentHandoffEvent({
      event: "denied",
      metadata: {
        authSubject: internalServiceActor?.id ?? null,
        handoffReason: apiError.errorCode.toLowerCase(),
        handoffType: "internal_agent_dispatch",
        operation: definition.operation,
        permissionDecision: "denied",
        targetAgentType: definition.agentType,
        targetEndpoint: definition.endpoint,
        taskStatus: "denied",
      },
      output: {
        error_code: apiError.errorCode,
        request_id: fallbackRequestId,
        status: apiError.status,
      },
      tags: ["internal_agent"],
    });

    throw error;
  }
}

export async function parseInternalAgentRequest<TPayload>(args: {
  definition: InternalAgentRouteDefinition;
  fallbackRequestId: string;
  legacySchema: z.ZodType<TPayload>;
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

  return parseInternalAgentEnvelope({
    body,
    definition: args.definition,
    fallbackRequestId: args.fallbackRequestId,
    legacySchema: args.legacySchema,
  });
}

export function reserveInternalAgentQuota(args: {
  correlationId: string;
  definition: InternalAgentRouteDefinition;
  requestId: string;
  runId: string;
  serviceActor: InternalServiceActorIdentity;
}) {
  return assertInternalAgentRateLimit(args);
}

export async function traceInternalAgentInvocation<TResult extends { stopReason?: string }>(args: {
  childRunId: string;
  definition: InternalAgentRouteDefinition;
  parentRunId: string;
  requestId: string;
  serviceActor: InternalServiceActorIdentity;
  version: InternalAgentSchemaVersion;
  invoke: () => Promise<TResult>;
}) {
  const startedAt = Date.now();

  const result = await traceAgentHandoff({
    event: "dispatch",
    input: {
      request_id: args.requestId,
      schema_version: args.version,
    },
    invoke: () =>
      traceSpan(
        {
          metadata: {
            agent_type: args.definition.agentType,
            endpoint: args.definition.endpoint,
            operation: args.definition.operation,
            request_id: args.requestId,
            schema_version: args.version,
            service_actor_id: args.serviceActor.serviceActorId,
            service_name: args.serviceActor.serviceName,
          },
          metrics: () => ({
            duration_ms: Date.now() - startedAt,
          }),
          name: `internal.agent.${args.definition.agentType}.${args.definition.operation}`,
          tags: [
            "internal_agent",
            `agent:${args.definition.agentType}`,
            `operation:${args.definition.operation}`,
            `service:${args.serviceActor.serviceName}`,
          ],
          type: "task",
        },
        args.invoke,
      ),
    metadata: {
      authSubject: args.serviceActor.id,
      childRunId: args.childRunId,
      handoffReason: "internal_service_request",
      handoffType: "internal_agent_dispatch",
      operation: args.definition.operation,
      parentRunId: args.parentRunId,
      permissionDecision: "allowed",
      targetAgentType: args.definition.agentType,
      targetEndpoint: args.definition.endpoint,
      taskStatus: "running",
    },
    metrics: () => ({
      duration_ms: Date.now() - startedAt,
    }),
    output: (value: TResult) => ({
      request_id: args.requestId,
      stop_reason: value.stopReason ?? null,
    }),
    tags: ["internal_agent"],
    type: "task",
  });

  emitAgentHandoffEvent({
    event: "complete",
    metadata: {
      authSubject: args.serviceActor.id,
      childRunId: args.childRunId,
      handoffReason: "internal_service_request",
      handoffType: "internal_agent_dispatch",
      operation: args.definition.operation,
      parentRunId: args.parentRunId,
      permissionDecision: "allowed",
      targetAgentType: args.definition.agentType,
      targetEndpoint: args.definition.endpoint,
      taskStatus: "completed",
    },
    output: {
      request_id: args.requestId,
      stop_reason: result.stopReason ?? null,
    },
    tags: ["internal_agent"],
  });

  return result;
}

export async function buildCandidateAgentContext(args: {
  correlationId: string;
  runContext: RunContext;
  talentIdentityId: string;
}) {
  const context = await findPersistentContextByTalentIdentityId({
    correlationId: args.correlationId,
    talentIdentityId: args.talentIdentityId,
  });
  const actor = createAuthenticatedAgentIdentity(context);
  const organizationContext = await loadAgentOrganizationContext({
    actor,
  });
  const childRunContext = createChildRunContext({
    parentRun: args.runContext,
  });

  return createAgentContext({
    actor,
    organizationContext,
    ownerId: actor.id,
    run: childRunContext,
  });
}

export async function buildRecruiterAgentContext(args: {
  correlationId: string;
  organizationId?: string | null;
  runContext: RunContext;
  userId: string;
}) {
  const context = await findPersistentContextByUserId({
    correlationId: args.correlationId,
    userId: args.userId,
  });
  const actor = createAuthenticatedAgentIdentity(context);

  if (!actor.roleType || !["recruiter", "hiring_manager"].includes(actor.roleType)) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The requested internal recruiter context is not recruiter-scoped.",
      details: {
        roleType: actor.roleType,
        userId: args.userId,
      },
      correlationId: args.correlationId,
    });
  }

  const organizationContext = selectOrganizationContext(
    args.correlationId,
    await loadAgentOrganizationContext({
      actor,
    }),
    args.organizationId ?? null,
  );
  const childRunContext = createChildRunContext({
    parentRun: args.runContext,
  });

  return createAgentContext({
    actor,
    organizationContext,
    ownerId: actor.id,
    run: childRunContext,
  });
}

export function buildVerifierAgentContext(args: {
  runContext: RunContext;
  serviceActor: InternalServiceActorIdentity;
}) {
  const actor =
    args.serviceActor.kind === "internal_service"
      ? args.serviceActor
      : createInternalServiceActorIdentity({
          serviceActorId: args.serviceActor.serviceActorId,
          serviceName: args.serviceActor.serviceName,
        });
  const childRunContext = createChildRunContext({
    parentRun: args.runContext,
  });

  return createAgentContext({
    actor,
    ownerId: actor.id,
    run: childRunContext,
  });
}

export function logInternalAgentRequestReceived(args: {
  definition: InternalAgentRouteDefinition;
  requestId: string;
  runId: string;
  serviceActor: InternalServiceActorIdentity;
  correlationId: string;
  version: InternalAgentSchemaVersion;
}) {
  logInternalAgentAuditEvent({
    correlationId: args.correlationId,
    eventType: "internal.agent.request.received",
    metadataJson: buildInternalAgentAuditMetadata(
      {
        agent_type: args.definition.agentType,
        operation: args.definition.operation,
        schema_version: args.version,
      },
      {
        authSubject: args.serviceActor.id,
        definition: args.definition,
        handoffReason: "internal_service_request",
        parentRunId: args.runId,
        permissionDecision: "allowed",
        taskStatus: "started",
      },
    ),
    requestId: args.requestId,
    runId: args.runId,
    serviceActor: args.serviceActor,
    targetId: args.definition.agentType,
    targetType: "internal_agent",
  });
}

export function createInternalAgentResponse(args: {
  correlationId: string;
  definition: InternalAgentRouteDefinition;
  durationMs: number;
  parentRunId: string;
  presentationSummary?: unknown;
  quota: InternalAgentQuotaMetadata | null;
  requestId: string;
  runId: string;
  serviceActor: InternalServiceActorIdentity;
  stepsUsed: number;
  stopReason: InternalAgentStopReason;
  toolCallsUsed: number;
  reply: string;
}) {
  const payload = internalAgentResponseSchema.parse({
    presentationSummary: args.presentationSummary ?? null,
    reply: args.reply,
    role: args.definition.agentType,
    runId: args.runId,
    stepsUsed: args.stepsUsed,
    stopReason: args.stopReason,
    toolCallsUsed: args.toolCallsUsed,
  });
  const metadata = buildMetadata({
    callerServiceName: args.serviceActor.serviceName,
    correlationId: args.correlationId,
    durationMs: args.durationMs,
    endpoint: args.definition.endpoint,
    quota: args.quota,
  });

  logInternalAgentAuditEvent({
    correlationId: args.correlationId,
    eventType: "internal.agent.request.completed",
    metadataJson: buildInternalAgentAuditMetadata(
      {
        agent_type: args.definition.agentType,
        duration_ms: args.durationMs,
        operation: args.definition.operation,
        status: "ok",
        stop_reason: args.stopReason,
        tool_calls_used: args.toolCallsUsed,
      },
      {
        authSubject: args.serviceActor.id,
        childRunId: args.runId,
        definition: args.definition,
        handoffReason: "internal_service_request",
        parentRunId: args.parentRunId,
        permissionDecision: "allowed",
        taskStatus: "completed",
      },
    ),
    requestId: args.requestId,
    runId: args.runId,
    serviceActor: args.serviceActor,
    targetId: args.definition.agentType,
    targetType: "internal_agent",
  });

  const response = applyTraceResponseHeaders(
    successResponse(
      internalAgentSuccessResponseSchema.parse({
        ...payload,
        agentType: args.definition.agentType,
        error: null,
        metadata,
        ok: true,
        operation: args.definition.operation,
        payload,
        requestId: args.requestId,
        version: "v1",
      }),
      args.correlationId,
    ),
  );

  return applyInternalAgentHeaders({
    agentType: args.definition.agentType,
    quota: args.quota,
    response,
  });
}

export function createInternalAgentErrorResponse(args: {
  childRunId?: string | null;
  correlationId: string;
  definition: InternalAgentRouteDefinition;
  durationMs: number;
  error: unknown;
  parentRunId?: string | null;
  quota?: InternalAgentQuotaMetadata | null;
  requestId: string;
  runId?: string | null;
  serviceActor?: InternalServiceActorIdentity | null;
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
  } satisfies InternalAgentError;
  const metadata = buildMetadata({
    callerServiceName: args.serviceActor?.serviceName ?? null,
    correlationId: apiError.correlationId,
    durationMs: args.durationMs,
    endpoint: args.definition.endpoint,
    quota: args.quota ?? derivedQuota,
  });

  if (args.serviceActor) {
    logInternalAgentAuditEvent({
      correlationId: apiError.correlationId,
      eventType: "internal.agent.request.failed",
      metadataJson: buildInternalAgentAuditMetadata(
        {
          agent_type: args.definition.agentType,
          duration_ms: args.durationMs,
          error_code: apiError.errorCode,
          operation: args.definition.operation,
          status: "error",
        },
        {
          authSubject: args.serviceActor.id,
          childRunId: args.childRunId ?? null,
          definition: args.definition,
          handoffReason: apiError.errorCode.toLowerCase(),
          parentRunId: args.parentRunId ?? null,
          permissionDecision:
            apiError.status === 401 || apiError.status === 403 || apiError.status === 429
              ? "denied"
              : "allowed",
          taskStatus: apiError.status >= 500 ? "failed" : "denied",
        },
      ),
      requestId: args.requestId,
      runId: args.runId ?? null,
      serviceActor: args.serviceActor,
      targetId: args.definition.agentType,
      targetType: "internal_agent",
    });
  }

  const response = applyTraceResponseHeaders(
    NextResponse.json(
      internalAgentErrorResponseSchema.parse({
        agentType: args.definition.agentType,
        correlation_id: normalizedError.correlationId,
        details: normalizedError.details,
        error: normalizedError,
        error_code: normalizedError.code,
        message: normalizedError.message,
        metadata,
        ok: false,
        operation: args.definition.operation,
        payload: null,
        requestId: args.requestId,
        version: "v1",
      }),
      {
        status: apiError.status,
        headers: {
          "x-correlation-id": apiError.correlationId,
        },
      },
    ),
  );

  return applyInternalAgentHeaders({
    agentType: args.definition.agentType,
    quota: args.quota ?? derivedQuota,
    response,
  });
}
