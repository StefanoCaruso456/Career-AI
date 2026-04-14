import type { ActorIdentity } from "@/actor-identity";
import { getRequestTraceContext } from "@/lib/tracing";
import { listOrganizationMembershipContextsForUser } from "@/packages/persistence/src";

export type RunTraceRoot = {
  braintrustRootSpanId: string | null;
  requestId: string | null;
  routeName: string | null;
  traceId: string | null;
};

export type RunContext = {
  correlationId: string;
  parentRunId: string | null;
  runId: string;
  traceRoot: RunTraceRoot;
};

export type AgentOrganizationMembership = {
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "member";
};

export type AgentOrganizationContext = {
  activeMembershipCount: number;
  memberships: AgentOrganizationMembership[];
  primaryOrganization: AgentOrganizationMembership | null;
};

export type AgentContext = {
  actor: ActorIdentity;
  organizationContext: AgentOrganizationContext | null;
  ownerId: string;
  preferredPersona: ActorIdentity["preferredPersona"];
  roleType: string | null;
  run: RunContext;
};

export function createRunContext(args: {
  correlationId: string;
  parentRunId?: string | null;
  runId?: string | null;
}): RunContext {
  const traceContext = getRequestTraceContext();

  return {
    correlationId: args.correlationId,
    parentRunId: args.parentRunId?.trim() || null,
    runId: args.runId?.trim() || crypto.randomUUID(),
    traceRoot: {
      braintrustRootSpanId: traceContext?.braintrustRootSpanId ?? null,
      requestId: traceContext?.requestId ?? null,
      routeName: traceContext?.routeName ?? null,
      traceId: traceContext?.traceId ?? null,
    },
  };
}

export function createChildRunContext(args: {
  parentRun: RunContext;
  runId?: string | null;
}): RunContext {
  return createRunContext({
    correlationId: args.parentRun.correlationId,
    parentRunId: args.parentRun.runId,
    runId: args.runId ?? null,
  });
}

function canLoadOrganizationContext(
  actor: ActorIdentity,
): actor is Extract<ActorIdentity, { kind: "authenticated_user" }> {
  return actor.kind === "authenticated_user" && Boolean(actor.appUserId);
}

function normalizeOrganizationMembership(args: {
  organizationId: string;
  organizationName: string;
  role: "owner" | "admin" | "member";
}): AgentOrganizationMembership {
  return {
    organizationId: args.organizationId,
    organizationName: args.organizationName,
    role: args.role,
  };
}

export async function loadAgentOrganizationContext(args: {
  actor: ActorIdentity;
}): Promise<AgentOrganizationContext | null> {
  if (!canLoadOrganizationContext(args.actor)) {
    return null;
  }

  const appUserId = args.actor.appUserId;

  if (!appUserId) {
    return null;
  }

  try {
    const memberships = await listOrganizationMembershipContextsForUser({
      status: "active",
      userId: appUserId,
    });
    const normalizedMemberships = memberships.map((membership) =>
      normalizeOrganizationMembership({
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        role: membership.membership.role,
      }),
    );

    return {
      activeMembershipCount: normalizedMemberships.length,
      memberships: normalizedMemberships,
      primaryOrganization: normalizedMemberships[0] ?? null,
    };
  } catch {
    return null;
  }
}

export function createAgentContext(args: {
  actor: ActorIdentity;
  organizationContext?: AgentOrganizationContext | null;
  ownerId: string;
  run: RunContext;
}): AgentContext {
  return {
    actor: args.actor,
    organizationContext: args.organizationContext ?? null,
    ownerId: args.ownerId,
    preferredPersona: args.actor.preferredPersona,
    roleType: args.actor.roleType ?? null,
    run: args.run,
  };
}
