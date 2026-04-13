import { timingSafeEqual } from "node:crypto";
import {
  createInternalServiceActorIdentity,
  getAuditActorTypeForActorIdentity,
  getRequestActorIdForActorIdentity,
  resolveAuthenticatedActorIdentity,
  type ActorIdentity,
} from "@/actor-identity";
import { auth } from "@/auth";
import { ApiError, type ActorType } from "@/packages/contracts/src";
import { logAuditEvent } from "./audit-store";

type AuthMethod = "internal_service" | "public" | "session";

type InternalServiceCredential = {
  serviceActorId: string | null;
  serviceName: string;
  token: string;
};

export type AuthenticatedActor = {
  actorId: string;
  actorType: ActorType;
  authMethod: AuthMethod;
  identity: ActorIdentity | null;
};

function normalizeConfiguredValue(value: string | null | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
}

function createSystemActor(args?: { actorId?: string }) {
  return {
    actorId: args?.actorId?.trim() || "public_request",
    actorType: "system_service" as const,
    authMethod: "public" as const,
    identity: null,
  };
}

function toAuthenticatedActor(identity: ActorIdentity, authMethod: Exclude<AuthMethod, "public">) {
  return {
    actorId: getRequestActorIdForActorIdentity(identity),
    actorType: getAuditActorTypeForActorIdentity(identity),
    authMethod,
    identity,
  };
}

function parseInternalServiceCredential(entry: string): InternalServiceCredential | null {
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

  const serviceDescriptor = normalizedEntry.slice(0, separatorIndex).trim();
  const token = normalizedEntry.slice(separatorIndex + 1).trim();

  if (!serviceDescriptor || !token) {
    return null;
  }

  const [serviceName, serviceActorId] = serviceDescriptor
    .split("|")
    .map((part) => part.trim());

  if (!serviceName) {
    return null;
  }

  return {
    serviceActorId: normalizeConfiguredValue(serviceActorId),
    serviceName,
    token,
  };
}

function getInternalServiceCredentials() {
  const rawValue = process.env.INTERNAL_SERVICE_AUTH_TOKENS?.trim();

  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(/[\n,]+/)
    .map((entry) => parseInternalServiceCredential(entry))
    .filter((entry): entry is InternalServiceCredential => Boolean(entry));
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

function resolveInternalServiceActor(headers: Headers): AuthenticatedActor | null {
  const bearerToken = readBearerToken(headers);

  if (!bearerToken) {
    return null;
  }

  const matchedCredential = getInternalServiceCredentials().find((credential) =>
    hasMatchingToken(bearerToken, credential.token),
  );

  if (!matchedCredential) {
    return null;
  }

  return toAuthenticatedActor(
    createInternalServiceActorIdentity({
      serviceActorId: matchedCredential.serviceActorId,
      serviceName: matchedCredential.serviceName,
    }),
    "internal_service",
  );
}

function getRequestPath(request: Request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

function logAuthorizationDenied(args: {
  action: string;
  actor?: AuthenticatedActor | null;
  correlationId: string;
  details?: Record<string, unknown>;
  targetId: string;
  targetType: string;
}) {
  const actor = args.actor ?? createSystemActor({ actorId: "anonymous_request" });

  logAuditEvent({
    actorId: actor.actorId,
    actorType: actor.actorType,
    correlationId: args.correlationId,
    eventType: "security.auth.denied",
    metadataJson: {
      action: args.action,
      actor_identity_id: actor.identity?.id ?? null,
      auth_method: actor.authMethod,
      ...args.details,
    },
    targetId: args.targetId,
    targetType: args.targetType,
  });
}

export function createPublicActor() {
  return createSystemActor();
}

export function getCorrelationId(headers: Headers): string {
  return headers.get("x-correlation-id") ?? crypto.randomUUID();
}

export async function resolveVerifiedActor(
  request: Request,
  correlationId: string,
  options?: { allowPublic?: boolean },
): Promise<AuthenticatedActor> {
  const internalServiceActor = resolveInternalServiceActor(request.headers);

  if (internalServiceActor) {
    return internalServiceActor;
  }

  const authenticatedIdentity = resolveAuthenticatedActorIdentity((await auth())?.user);

  if (authenticatedIdentity) {
    return toAuthenticatedActor(authenticatedIdentity, "session");
  }

  if (options?.allowPublic) {
    return createPublicActor();
  }

  logAuthorizationDenied({
    action: "resolve verified actor",
    correlationId,
    details: {
      has_authorization_header: Boolean(request.headers.get("authorization")),
      route: getRequestPath(request),
    },
    targetId: getRequestPath(request),
    targetType: "route",
  });

  throw new ApiError({
    errorCode: "UNAUTHORIZED",
    status: 401,
    message: "Verified authentication is required.",
    details: ["session", "authorization"],
    correlationId,
  });
}

export function assertTalentIdentityAccess(
  actor: AuthenticatedActor,
  talentIdentityId: string,
  correlationId: string,
) {
  if (actor.actorType === "system_service") {
    return;
  }

  if (actor.actorType === "talent_user" && actor.actorId === talentIdentityId) {
    return;
  }

  logAuthorizationDenied({
    action: "access talent identity",
    actor,
    correlationId,
    details: {
      requested_talent_identity_id: talentIdentityId,
    },
    targetId: talentIdentityId,
    targetType: "talent_identity",
  });

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "Actor cannot access this talent identity.",
    details: {
      actorType: actor.actorType,
      actorId: actor.actorId,
      talentIdentityId,
    },
    correlationId,
  });
}

export function assertAllowedActorTypes(
  actor: AuthenticatedActor,
  allowedActorTypes: ActorType[],
  correlationId: string,
  action: string,
) {
  if (allowedActorTypes.includes(actor.actorType)) {
    return;
  }

  logAuthorizationDenied({
    action,
    actor,
    correlationId,
    details: {
      allowed_actor_types: allowedActorTypes,
    },
    targetId: action,
    targetType: "authorization_action",
  });

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: `Actor cannot ${action}.`,
    details: {
      actorType: actor.actorType,
      actorId: actor.actorId,
      allowedActorTypes,
    },
    correlationId,
  });
}

export function assertReviewerAccess(
  actor: AuthenticatedActor,
  correlationId: string,
  action = "perform reviewer action",
) {
  assertAllowedActorTypes(actor, ["reviewer_admin", "system_service"], correlationId, action);
}
