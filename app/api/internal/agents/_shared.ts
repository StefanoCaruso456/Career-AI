import type { AuthenticatedActorIdentity, InternalServiceActorIdentity } from "@/actor-identity";
import { createInternalServiceActorIdentity } from "@/actor-identity";
import { applyTraceResponseHeaders, updateRequestTraceContext } from "@/lib/tracing";
import {
  createAgentContext,
  createRunContext,
  loadAgentOrganizationContext,
  type AgentContext,
  type AgentOrganizationContext,
  type RunContext,
} from "@/packages/agent-runtime/src";
import {
  assertAllowedActorTypes,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError, internalAgentResponseSchema, type InternalAgentRole } from "@/packages/contracts/src";
import {
  findPersistentContextByTalentIdentityId,
  findPersistentContextByUserId,
  type PersistentTalentIdentityContext,
} from "@/packages/persistence/src";

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

export async function resolveInternalAgentRouteContext(request: Request, action: string) {
  const correlationId = getCorrelationId(request.headers);
  const actor = await resolveVerifiedActor(request, correlationId);

  assertAllowedActorTypes(actor, ["system_service"], correlationId, action);

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

  return {
    correlationId,
    runContext,
    serviceActor: actor.identity,
  };
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

  return createAgentContext({
    actor,
    organizationContext,
    ownerId: actor.id,
    run: args.runContext,
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

  return createAgentContext({
    actor,
    organizationContext,
    ownerId: actor.id,
    run: args.runContext,
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

  return createAgentContext({
    actor,
    ownerId: actor.id,
    run: args.runContext,
  });
}

export function createInternalAgentResponse(args: {
  correlationId: string;
  presentationSummary?: unknown;
  role: InternalAgentRole;
  runId: string;
  stepsUsed: number;
  stopReason: import("@/packages/contracts/src").InternalAgentStopReason;
  toolCallsUsed: number;
  reply: string;
}) {
  return applyTraceResponseHeaders(
    successResponse(
      internalAgentResponseSchema.parse({
        presentationSummary: args.presentationSummary ?? null,
        reply: args.reply,
        role: args.role,
        runId: args.runId,
        stepsUsed: args.stepsUsed,
        stopReason: args.stopReason,
        toolCallsUsed: args.toolCallsUsed,
      }),
      args.correlationId,
    ),
  );
}

export function createInternalAgentErrorResponse(error: unknown, correlationId: string) {
  return applyTraceResponseHeaders(errorResponse(error, correlationId));
}
