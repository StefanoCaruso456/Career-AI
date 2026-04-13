import { ApiError, type AccessScope, type ActorType } from "@/packages/contracts/src";
import type { AgentContext } from "@/packages/agent-runtime/src";
import {
  createAccessGrantRecord,
  createAccessRequestRecord,
  ensurePrimaryOrganizationForUser,
  findAccessRequestById,
  findActiveAccessGrant,
  findOrganizationMembership,
  listOrganizationMembershipsForUser,
  markAccessRequestGranted,
  markAccessRequestRejected,
} from "@/packages/persistence/src";
import type { AuthenticatedActor } from "./auth";
import { logAuditEvent } from "./audit-store";

const RECRUITER_ROLE_TYPES = new Set(["recruiter", "hiring_manager"]);

function isAgentToolPermissionEnforcementEnabled() {
  const configuredValue = process.env.CAREER_AI_ENFORCE_AGENT_TOOL_PERMISSIONS?.trim().toLowerCase();

  return configuredValue !== "0" && configuredValue !== "false";
}

function normalizeRoleType(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

function isRecruiterRole(roleType: string | null | undefined) {
  const normalizedRoleType = normalizeRoleType(roleType);

  return Boolean(normalizedRoleType && RECRUITER_ROLE_TYPES.has(normalizedRoleType));
}

function buildDefaultOrganizationName(name: string | null | undefined, email: string | null | undefined) {
  const normalizedName = name?.replace(/\s+/g, " ").trim();

  if (normalizedName) {
    return `${normalizedName} Recruiting`;
  }

  const localPart = email?.split("@")[0]?.replace(/[._-]+/g, " ")?.trim();

  if (localPart) {
    return `${localPart
      .split(" ")
      .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
      .join(" ")} Recruiting`;
  }

  return "Recruiting Workspace";
}

function requireSessionUserId(actor: AuthenticatedActor, correlationId: string) {
  if (actor.identity?.kind === "authenticated_user" && actor.identity.appUserId) {
    return actor.identity.appUserId;
  }

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "A persistent authenticated user is required for this action.",
    details: {
      actorId: actor.actorId,
      actorType: actor.actorType,
    },
    correlationId,
  });
}

function logAccessAuditEvent(args: {
  actorId: string;
  actorType: ActorType;
  correlationId: string;
  eventType: string;
  metadataJson?: Record<string, unknown>;
  runId?: string | null;
  targetId: string;
  targetType: string;
}) {
  logAuditEvent({
    actorId: args.actorId,
    actorType: args.actorType,
    correlationId: args.correlationId,
    eventType: args.eventType,
    metadataJson: args.metadataJson,
    runId: args.runId ?? null,
    targetId: args.targetId,
    targetType: args.targetType,
  });
}

function logToolAccessDenied(args: {
  actor: AgentContext["actor"];
  correlationId: string;
  reason: string;
  runId: string;
  toolName: string;
}) {
  logAuditEvent({
    actorId:
      args.actor.kind === "authenticated_user"
        ? args.actor.talentIdentityId ?? args.actor.appUserId ?? args.actor.id
        : args.actor.kind === "guest_user"
          ? args.actor.guestSessionId
          : args.actor.serviceActorId,
    actorType:
      args.actor.kind === "internal_service"
        ? "system_service"
        : args.actor.roleType === "reviewer_admin"
          ? "reviewer_admin"
          : args.actor.roleType === "recruiter"
            ? "recruiter_user"
            : args.actor.roleType === "hiring_manager"
              ? "hiring_manager_user"
              : "talent_user",
    correlationId: args.correlationId,
    eventType: "security.tool_access.denied",
    metadataJson: {
      actor_kind: args.actor.kind,
      reason: args.reason,
      role_type: args.actor.roleType ?? null,
      tool_name: args.toolName,
    },
    runId: args.runId,
    targetId: args.toolName,
    targetType: "agent_tool",
  });
}

export async function assertAgentToolPermission(args: {
  agentContext: AgentContext;
  toolName: string;
}) {
  if (!isAgentToolPermissionEnforcementEnabled()) {
    return;
  }

  const { actor } = args.agentContext;

  if (args.toolName === "search_jobs") {
    return;
  }

  if (args.toolName === "get_career_id_summary") {
    if (actor.kind !== "guest_user") {
      return;
    }

    logToolAccessDenied({
      actor,
      correlationId: args.agentContext.run.correlationId,
      reason: "guest_actor",
      runId: args.agentContext.run.runId,
      toolName: args.toolName,
    });
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Guests cannot access Career ID summaries.",
      details: { toolName: args.toolName },
      correlationId: args.agentContext.run.correlationId,
    });
  }

  if (args.toolName === "search_candidates") {
    if (actor.kind === "authenticated_user" && isRecruiterRole(actor.roleType)) {
      return;
    }

    logToolAccessDenied({
      actor,
      correlationId: args.agentContext.run.correlationId,
      reason: "missing_recruiter_role",
      runId: args.agentContext.run.runId,
      toolName: args.toolName,
    });
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Only recruiter or hiring-manager actors can search candidates.",
      details: { toolName: args.toolName },
      correlationId: args.agentContext.run.correlationId,
    });
  }
}

export async function createScopedAccessRequest(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  justification: string;
  organizationId?: string | null;
  scope: AccessScope;
  subjectTalentIdentityId: string;
}) {
  if (!isRecruiterRole(args.actor.identity?.roleType)) {
    logAccessAuditEvent({
      actorId: args.actor.actorId,
      actorType: args.actor.actorType,
      correlationId: args.correlationId,
      eventType: "security.access_request.denied",
      metadataJson: {
        reason: "missing_recruiter_role",
        scope: args.scope,
        subject_talent_identity_id: args.subjectTalentIdentityId,
      },
      targetId: args.subjectTalentIdentityId,
      targetType: "talent_identity",
    });
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Only recruiter and hiring-manager actors can request candidate access.",
      details: { scope: args.scope },
      correlationId: args.correlationId,
    });
  }

  const requesterUserId = requireSessionUserId(args.actor, args.correlationId);
  const membership = args.organizationId
    ? await findOrganizationMembership({
        organizationId: args.organizationId,
        status: "active",
        userId: requesterUserId,
      })
    : await ensurePrimaryOrganizationForUser({
        organizationName: buildDefaultOrganizationName(
          args.actor.identity?.kind === "authenticated_user" ? args.actor.identity.name : null,
          args.actor.identity?.kind === "authenticated_user" ? args.actor.identity.email : null,
        ),
        userId: requesterUserId,
      });

  if (!membership) {
    logAccessAuditEvent({
      actorId: args.actor.actorId,
      actorType: args.actor.actorType,
      correlationId: args.correlationId,
      eventType: "security.access_request.denied",
      metadataJson: {
        organization_id: args.organizationId ?? null,
        reason: "missing_org_membership",
        scope: args.scope,
      },
      targetId: args.organizationId ?? args.subjectTalentIdentityId,
      targetType: args.organizationId ? "organization" : "talent_identity",
    });
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "An active organization membership is required to request candidate access.",
      details: { organizationId: args.organizationId ?? null },
      correlationId: args.correlationId,
    });
  }

  const request = await createAccessRequestRecord({
    justification: args.justification,
    metadataJson: {
      requester_actor_id: args.actor.actorId,
    },
    organizationId: membership.organizationId,
    requesterUserId,
    scope: args.scope,
    subjectTalentIdentityId: args.subjectTalentIdentityId,
  });

  logAccessAuditEvent({
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    correlationId: args.correlationId,
    eventType: "access.request.created",
    metadataJson: {
      organization_id: request.organizationId,
      scope: request.scope,
      status: request.status,
    },
    targetId: request.id,
    targetType: "access_request",
  });

  return request;
}

function assertGrantAuthority(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  subjectTalentIdentityId: string;
}) {
  if (args.actor.actorType === "system_service") {
    return;
  }

  if (args.actor.actorType === "talent_user" && args.actor.actorId === args.subjectTalentIdentityId) {
    return;
  }

  logAccessAuditEvent({
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    correlationId: args.correlationId,
    eventType: "security.access_request.denied",
    metadataJson: {
      reason: "missing_grant_authority",
      subject_talent_identity_id: args.subjectTalentIdentityId,
    },
    targetId: args.subjectTalentIdentityId,
    targetType: "talent_identity",
  });

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "Only the owning candidate or an internal service can resolve this access request.",
    details: {
      subjectTalentIdentityId: args.subjectTalentIdentityId,
    },
    correlationId: args.correlationId,
  });
}

export async function grantScopedAccessRequest(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  expiresAt?: string | null;
  note?: string | null;
  requestId: string;
}) {
  const request = await findAccessRequestById({
    requestId: args.requestId,
  });

  if (!request) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Access request was not found.",
      details: { requestId: args.requestId },
      correlationId: args.correlationId,
    });
  }

  if (request.status !== "pending") {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Only pending access requests can be granted.",
      details: {
        requestId: request.id,
        status: request.status,
      },
      correlationId: args.correlationId,
    });
  }

  assertGrantAuthority({
    actor: args.actor,
    correlationId: args.correlationId,
    subjectTalentIdentityId: request.subjectTalentIdentityId,
  });

  const grant = await createAccessGrantRecord({
    accessRequestId: request.id,
    expiresAt: args.expiresAt ?? null,
    grantedByActorId: args.actor.actorId,
    grantedByActorType: args.actor.actorType,
    metadataJson: args.note ? { note: args.note } : {},
    organizationId: request.organizationId,
    scope: request.scope,
    subjectTalentIdentityId: request.subjectTalentIdentityId,
  });

  await markAccessRequestGranted({
    grantedByActorId: args.actor.actorId,
    grantedByActorType: args.actor.actorType,
    metadataJson: args.note ? { note: args.note } : {},
    requestId: request.id,
  });

  logAccessAuditEvent({
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    correlationId: args.correlationId,
    eventType: "access.grant.created",
    metadataJson: {
      access_request_id: request.id,
      expires_at: grant.expiresAt,
      organization_id: grant.organizationId,
      scope: grant.scope,
    },
    targetId: grant.id,
    targetType: "access_grant",
  });

  return grant;
}

export async function rejectScopedAccessRequest(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  note?: string | null;
  requestId: string;
}) {
  const request = await findAccessRequestById({
    requestId: args.requestId,
  });

  if (!request) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Access request was not found.",
      details: { requestId: args.requestId },
      correlationId: args.correlationId,
    });
  }

  if (request.status !== "pending") {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Only pending access requests can be rejected.",
      details: {
        requestId: request.id,
        status: request.status,
      },
      correlationId: args.correlationId,
    });
  }

  assertGrantAuthority({
    actor: args.actor,
    correlationId: args.correlationId,
    subjectTalentIdentityId: request.subjectTalentIdentityId,
  });

  const updatedRequest = await markAccessRequestRejected({
    metadataJson: args.note ? { note: args.note } : {},
    rejectedByActorId: args.actor.actorId,
    rejectedByActorType: args.actor.actorType,
    requestId: request.id,
  });

  if (!updatedRequest) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Access request was not found.",
      details: { requestId: args.requestId },
      correlationId: args.correlationId,
    });
  }

  logAccessAuditEvent({
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    correlationId: args.correlationId,
    eventType: "access.request.rejected",
    metadataJson: {
      organization_id: updatedRequest.organizationId,
      scope: updatedRequest.scope,
      status: updatedRequest.status,
    },
    targetId: updatedRequest.id,
    targetType: "access_request",
  });

  return updatedRequest;
}

export async function hasScopedCandidateAccess(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  scope: AccessScope;
  subjectTalentIdentityId: string;
}) {
  if (args.actor.actorType === "system_service") {
    return true;
  }

  if (args.actor.actorType === "talent_user" && args.actor.actorId === args.subjectTalentIdentityId) {
    return true;
  }

  if (!isRecruiterRole(args.actor.identity?.roleType)) {
    return false;
  }

  const requesterUserId = requireSessionUserId(args.actor, args.correlationId);
  const memberships = await listOrganizationMembershipsForUser({
    status: "active",
    userId: requesterUserId,
  });

  for (const membership of memberships) {
    const grant = await findActiveAccessGrant({
      organizationId: membership.organizationId,
      scope: args.scope,
      subjectTalentIdentityId: args.subjectTalentIdentityId,
    });

    if (grant) {
      return true;
    }
  }

  return false;
}
