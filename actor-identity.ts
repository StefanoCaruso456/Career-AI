import { getPersona, type Persona } from "@/lib/personas";
import type { ActorType } from "@/packages/contracts/src";

type SessionUserLike = {
  appUserId?: string | null;
  authProvider?: string | null;
  email?: string | null;
  name?: string | null;
  preferredPersona?: string | null;
  providerUserId?: string | null;
  roleType?: string | null;
  talentIdentityId?: string | null;
};

function normalizeStableValue(value: string | null | undefined) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  return normalizedValue;
}

function normalizePreferredPersona(value: string | null | undefined): Persona | null {
  if (!value?.trim()) {
    return null;
  }

  return getPersona(value);
}

export type AuthenticatedActorIdentity = {
  appUserId: string | null;
  authProvider: string | null;
  authSource: "nextauth_session";
  email: string | null;
  id: `user:${string}`;
  kind: "authenticated_user";
  name: string | null;
  preferredPersona: Persona | null;
  providerUserId: string | null;
  roleType: string | null;
  talentIdentityId: string | null;
};

export type GuestActorIdentity = {
  authSource: "chat_owner_cookie";
  guestSessionId: string;
  id: `guest:${string}`;
  kind: "guest_user";
  preferredPersona: Persona | null;
  roleType: null;
};

export type InternalServiceActorIdentity = {
  authSource: "internal_service";
  id: `service:${string}`;
  kind: "internal_service";
  preferredPersona: Persona | null;
  roleType: string | null;
  serviceActorId: string;
  serviceName: string;
};

export type ActorIdentity =
  | AuthenticatedActorIdentity
  | GuestActorIdentity
  | InternalServiceActorIdentity;

export function resolveAuthenticatedActorIdentity(
  user: SessionUserLike | null | undefined,
): AuthenticatedActorIdentity | null {
  if (!user) {
    return null;
  }

  const stableActorId =
    normalizeStableValue(user.talentIdentityId) ??
    normalizeStableValue(user.appUserId) ??
    normalizeStableValue(user.email?.toLowerCase()) ??
    normalizeStableValue(user.providerUserId);

  if (!stableActorId) {
    return null;
  }

  return {
    appUserId: normalizeStableValue(user.appUserId),
    authProvider: normalizeStableValue(user.authProvider),
    authSource: "nextauth_session",
    email: normalizeStableValue(user.email?.toLowerCase()),
    id: `user:${stableActorId}`,
    kind: "authenticated_user",
    name: normalizeStableValue(user.name),
    preferredPersona: normalizePreferredPersona(user.preferredPersona),
    providerUserId: normalizeStableValue(user.providerUserId),
    roleType: normalizeStableValue(user.roleType),
    talentIdentityId: normalizeStableValue(user.talentIdentityId),
  };
}

export function createGuestActorIdentity(args: {
  ownerId: string;
  preferredPersona?: Persona | null;
}): GuestActorIdentity {
  const ownerId = args.ownerId.trim();

  if (!ownerId.startsWith("guest:")) {
    throw new Error("Guest actor identity requires a guest owner id.");
  }

  return {
    authSource: "chat_owner_cookie",
    guestSessionId: ownerId.slice("guest:".length),
    id: ownerId as `guest:${string}`,
    kind: "guest_user",
    preferredPersona: args.preferredPersona ?? null,
    roleType: null,
  };
}

export function createInternalServiceActorIdentity(args: {
  preferredPersona?: Persona | null;
  roleType?: string | null;
  serviceActorId?: string | null;
  serviceName: string;
}): InternalServiceActorIdentity {
  const normalizedServiceName = args.serviceName.trim();
  const normalizedActorId =
    normalizeStableValue(args.serviceActorId) ?? normalizedServiceName;

  return {
    authSource: "internal_service",
    id: `service:${normalizedActorId}`,
    kind: "internal_service",
    preferredPersona: args.preferredPersona ?? null,
    roleType: normalizeStableValue(args.roleType),
    serviceActorId: normalizedActorId,
    serviceName: normalizedServiceName,
  };
}

export function resolveActorIdentity(args: {
  guestOwnerId?: string | null;
  preferredPersona?: Persona | null;
  serviceActorId?: string | null;
  serviceName?: string | null;
  sessionUser?: SessionUserLike | null;
}): ActorIdentity {
  const authenticatedIdentity = resolveAuthenticatedActorIdentity(args.sessionUser);

  if (authenticatedIdentity) {
    return authenticatedIdentity;
  }

  if (args.serviceName?.trim()) {
    return createInternalServiceActorIdentity({
      preferredPersona: args.preferredPersona ?? null,
      roleType: null,
      serviceActorId: args.serviceActorId ?? null,
      serviceName: args.serviceName,
    });
  }

  const guestOwnerId = normalizeStableValue(args.guestOwnerId);

  if (guestOwnerId?.startsWith("guest:")) {
    return createGuestActorIdentity({
      ownerId: guestOwnerId,
      preferredPersona: args.preferredPersona ?? null,
    });
  }

  throw new Error("Unable to resolve an actor identity from the provided inputs.");
}

export function getAuditActorTypeForActorIdentity(identity: ActorIdentity): ActorType {
  if (identity.kind === "internal_service") {
    return "system_service";
  }

  if (identity.kind === "guest_user") {
    return "system_service";
  }

  if (identity.roleType === "recruiter") {
    return "recruiter_user";
  }

  if (identity.roleType === "hiring_manager") {
    return "hiring_manager_user";
  }

  return "talent_user";
}
