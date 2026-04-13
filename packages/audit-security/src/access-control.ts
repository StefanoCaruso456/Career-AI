import {
  getAuditActorTypeForActorIdentity,
  getRequestActorIdForActorIdentity,
} from "@/actor-identity";
import { ApiError, type AccessScope, type ActorType } from "@/packages/contracts/src";
import type { AgentContext } from "@/packages/agent-runtime/src";
import {
  createAccessGrantRecord,
  createAccessRequestRecord,
  ensurePrimaryOrganizationForUser,
  findAccessRequestById,
  findActiveAccessGrant,
  findLatestAccessGrantByRequestId,
  findOrganizationMembership,
  listOrganizationMembershipsForUser,
  markAccessRequestGranted,
  markAccessRequestRejected,
  revokeAccessGrantRecord,
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

function parseRequestedDurationDays(metadataJson: Record<string, unknown> | null | undefined) {
  const value = metadataJson?.requested_duration_days;

  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 365) {
    return value;
  }

  return null;
}

function buildRequestedExpiryFromRequestMetadata(
  metadataJson: Record<string, unknown> | null | undefined,
) {
  const requestedDurationDays = parseRequestedDurationDays(metadataJson);

  if (!requestedDurationDays) {
    return null;
  }

  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + requestedDurationDays);
  return expiresAt.toISOString();
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
  metadataJson?: Record<string, unknown>;
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
      ...args.metadataJson,
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

  if (
    args.toolName === "get_claim_details" ||
    args.toolName === "get_verification_record" ||
    args.toolName === "list_provenance_records"
  ) {
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
      message: "Guests cannot access private verification data tools.",
      details: { toolName: args.toolName },
      correlationId: args.agentContext.run.correlationId,
    });
  }
}

export async function createScopedAccessRequest(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  justification: string;
  metadataJsonOptional?: Record<string, unknown>;
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
      ...(args.metadataJsonOptional ?? {}),
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

  const effectiveExpiresAt =
    args.expiresAt ?? buildRequestedExpiryFromRequestMetadata(request.metadataJson);
  const nextMetadataJson = {
    ...(request.metadataJson ?? {}),
    ...(args.note ? { resolution_note: args.note } : {}),
  };

  const grant = await createAccessGrantRecord({
    accessRequestId: request.id,
    expiresAt: effectiveExpiresAt ?? null,
    grantedByActorId: args.actor.actorId,
    grantedByActorType: args.actor.actorType,
    metadataJson: nextMetadataJson,
    organizationId: request.organizationId,
    scope: request.scope,
    subjectTalentIdentityId: request.subjectTalentIdentityId,
  });

  await markAccessRequestGranted({
    grantedByActorId: args.actor.actorId,
    grantedByActorType: args.actor.actorType,
    metadataJson: nextMetadataJson,
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

  const nextMetadataJson = {
    ...(request.metadataJson ?? {}),
    ...(args.note ? { resolution_note: args.note } : {}),
  };

  const updatedRequest = await markAccessRequestRejected({
    metadataJson: nextMetadataJson,
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

export async function revokeScopedAccessGrant(args: {
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

  assertGrantAuthority({
    actor: args.actor,
    correlationId: args.correlationId,
    subjectTalentIdentityId: request.subjectTalentIdentityId,
  });

  const latestGrant = await findLatestAccessGrantByRequestId({
    requestId: request.id,
  });

  if (!latestGrant) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "No access grant exists for this request.",
      details: { requestId: request.id },
      correlationId: args.correlationId,
    });
  }

  if (latestGrant.status !== "active") {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Only active access grants can be revoked.",
      details: {
        grantId: latestGrant.id,
        status: latestGrant.status,
      },
      correlationId: args.correlationId,
    });
  }

  if (latestGrant.expiresAt && new Date(latestGrant.expiresAt).getTime() < Date.now()) {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Expired access grants no longer need revocation.",
      details: {
        expiresAt: latestGrant.expiresAt,
        grantId: latestGrant.id,
      },
      correlationId: args.correlationId,
    });
  }

  const revokedGrant = await revokeAccessGrantRecord({
    grantId: latestGrant.id,
    metadataJson: {
      ...(latestGrant.metadataJson ?? {}),
      ...(args.note ? { revocation_note: args.note } : {}),
      revoked_access_request_id: request.id,
    },
    revokedByActorId: args.actor.actorId,
    revokedByActorType: args.actor.actorType,
  });

  if (!revokedGrant) {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Only active access grants can be revoked.",
      details: {
        grantId: latestGrant.id,
      },
      correlationId: args.correlationId,
    });
  }

  logAccessAuditEvent({
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    correlationId: args.correlationId,
    eventType: "access.grant.revoked",
    metadataJson: {
      access_request_id: request.id,
      organization_id: revokedGrant.organizationId,
      scope: revokedGrant.scope,
      revoked_at: revokedGrant.revokedAt,
    },
    targetId: revokedGrant.id,
    targetType: "access_grant",
  });

  return revokedGrant;
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

  if (args.actor.actorType === "reviewer_admin") {
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

function toAuthenticatedActorFromAgentContext(agentContext: AgentContext): AuthenticatedActor | null {
  const { actor } = agentContext;

  if (actor.kind === "guest_user") {
    return null;
  }

  return {
    actorId: getRequestActorIdForActorIdentity(actor),
    actorType: getAuditActorTypeForActorIdentity(actor),
    authMethod: actor.kind === "internal_service" ? "internal_service" : "session",
    identity: actor,
  };
}

export async function assertAgentCandidatePrivateAccess(args: {
  agentContext: AgentContext;
  scope?: AccessScope;
  subjectTalentIdentityId: string;
  toolName: string;
}) {
  const actor = toAuthenticatedActorFromAgentContext(args.agentContext);

  if (
    actor &&
    (await hasScopedCandidateAccess({
      actor,
      correlationId: args.agentContext.run.correlationId,
      scope: args.scope ?? "candidate_private_profile",
      subjectTalentIdentityId: args.subjectTalentIdentityId,
    }))
  ) {
    return;
  }

  logToolAccessDenied({
    actor: args.agentContext.actor,
    correlationId: args.agentContext.run.correlationId,
    metadataJson: {
      scope: args.scope ?? "candidate_private_profile",
      subject_talent_identity_id: args.subjectTalentIdentityId,
    },
    reason: actor ? "missing_candidate_private_access_grant" : "guest_actor",
    runId: args.agentContext.run.runId,
    toolName: args.toolName,
  });

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "The actor does not have permission to access private candidate verification data.",
    details: {
      scope: args.scope ?? "candidate_private_profile",
      subjectTalentIdentityId: args.subjectTalentIdentityId,
      toolName: args.toolName,
    },
    correlationId: args.agentContext.run.correlationId,
  });
}
