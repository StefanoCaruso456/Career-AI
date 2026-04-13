import { timingSafeEqual } from "node:crypto";
import { createInternalServiceActorIdentity } from "@/actor-identity";
import type { InternalServiceActorIdentity } from "@/actor-identity";
import { logAuditEvent } from "@/packages/audit-security/src";
import { ApiError, type InternalAgentRole } from "@/packages/contracts/src";

type ExternalAgentCredential = {
  allowedAgents: InternalAgentRole[] | "*";
  serviceActorId: string | null;
  serviceName: string;
  token: string;
};

export type ExternalAgentCaller = {
  actorId: string;
  actorType: "system_service";
  authMethod: "external_service_bearer";
  credential: ExternalAgentCredential;
  identity: InternalServiceActorIdentity;
};

function normalizeConfiguredValue(value: string | null | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
}

function getRequestPath(request: Request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

function parseAllowedAgents(rawValue: string | undefined) {
  const normalizedValue = rawValue?.trim();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue === "*") {
    return "*" as const;
  }

  const allowedAgents = normalizedValue
    .split("+")
    .map((value) => value.trim())
    .filter((value): value is InternalAgentRole =>
      value === "candidate" || value === "recruiter" || value === "verifier",
    );

  return allowedAgents.length > 0 ? allowedAgents : null;
}

function parseExternalAgentCredential(entry: string): ExternalAgentCredential | null {
  const normalizedEntry = entry.trim();

  if (!normalizedEntry) {
    return null;
  }

  const separatorIndex = normalizedEntry.includes("=")
    ? normalizedEntry.indexOf("=")
    : normalizedEntry.indexOf(":");

  if (separatorIndex <= 0) {
    return null;
  }

  const descriptor = normalizedEntry.slice(0, separatorIndex).trim();
  const token = normalizedEntry.slice(separatorIndex + 1).trim();

  if (!descriptor || !token) {
    return null;
  }

  const [serviceName, serviceActorId, allowedAgentsRaw] = descriptor
    .split("|")
    .map((part) => part.trim());

  if (!serviceName) {
    return null;
  }

  const allowedAgents = parseAllowedAgents(allowedAgentsRaw);

  if (!allowedAgents) {
    return null;
  }

  return {
    allowedAgents,
    serviceActorId: normalizeConfiguredValue(serviceActorId),
    serviceName,
    token,
  };
}

function getExternalAgentCredentials() {
  const rawValue = process.env.EXTERNAL_AGENT_AUTH_TOKENS?.trim();

  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(/[\n;]+/)
    .map((entry) => parseExternalAgentCredential(entry))
    .filter((entry): entry is ExternalAgentCredential => Boolean(entry));
}

function hasMatchingToken(actualToken: string, expectedToken: string) {
  const actualBuffer = Buffer.from(actualToken);
  const expectedBuffer = Buffer.from(expectedToken);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function readBearerToken(headers: Headers) {
  const authorizationHeader = headers.get("authorization")?.trim();

  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token || null;
}

function toExternalAgentCaller(credential: ExternalAgentCredential): ExternalAgentCaller {
  const identity = createInternalServiceActorIdentity({
    serviceActorId: credential.serviceActorId,
    serviceName: credential.serviceName,
  });

  return {
    actorId: identity.serviceActorId,
    actorType: "system_service",
    authMethod: "external_service_bearer",
    credential,
    identity,
  };
}

function logExternalAuthDenied(args: {
  agentType?: InternalAgentRole | null;
  correlationId: string;
  reason: string;
  request: Request;
  caller?: ExternalAgentCaller | null;
}) {
  const caller = args.caller ?? null;

  logAuditEvent({
    actorId: caller?.actorId ?? "anonymous_external_agent",
    actorType: "system_service",
    correlationId: args.correlationId,
    eventType: "security.external_a2a.auth.denied",
    metadataJson: {
      agent_type: args.agentType ?? null,
      auth_method: "external_service_bearer",
      has_authorization_header: Boolean(args.request.headers.get("authorization")),
      reason: args.reason,
      route: getRequestPath(args.request),
      service_name: caller?.identity.serviceName ?? null,
    },
    targetId: args.agentType ?? getRequestPath(args.request),
    targetType: args.agentType ? "external_agent" : "route",
  });
}

export function isExternalAgentAuthorizedForAgent(
  caller: ExternalAgentCaller,
  agentType: InternalAgentRole,
) {
  return caller.credential.allowedAgents === "*" || caller.credential.allowedAgents.includes(agentType);
}

export function resolveVerifiedExternalAgentCaller(args: {
  agentType?: InternalAgentRole | null;
  correlationId: string;
  request: Request;
}) {
  const bearerToken = readBearerToken(args.request.headers);

  if (!bearerToken) {
    logExternalAuthDenied({
      agentType: args.agentType ?? null,
      correlationId: args.correlationId,
      reason: "missing_bearer_token",
      request: args.request,
    });

    throw new ApiError({
      errorCode: "UNAUTHORIZED",
      status: 401,
      message: "External agent authentication is required.",
      details: ["authorization"],
      correlationId: args.correlationId,
    });
  }

  const matchedCredential = getExternalAgentCredentials().find((credential) =>
    hasMatchingToken(bearerToken, credential.token),
  );

  if (!matchedCredential) {
    logExternalAuthDenied({
      agentType: args.agentType ?? null,
      correlationId: args.correlationId,
      reason: "invalid_bearer_token",
      request: args.request,
    });

    throw new ApiError({
      errorCode: "UNAUTHORIZED",
      status: 401,
      message: "External agent authentication failed.",
      details: ["authorization"],
      correlationId: args.correlationId,
    });
  }

  const caller = toExternalAgentCaller(matchedCredential);

  if (args.agentType && !isExternalAgentAuthorizedForAgent(caller, args.agentType)) {
    logExternalAuthDenied({
      agentType: args.agentType,
      caller,
      correlationId: args.correlationId,
      reason: "agent_not_authorized_for_caller",
      request: args.request,
    });

    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "The authenticated external caller is not authorized for this agent.",
      details: {
        agentType: args.agentType,
        serviceName: caller.identity.serviceName,
      },
      correlationId: args.correlationId,
    });
  }

  return caller;
}
