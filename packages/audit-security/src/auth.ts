import { ApiError, actorTypeSchema, type ActorType } from "@/packages/contracts/src";

export type AuthenticatedActor = {
  actorType: ActorType;
  actorId: string;
};

export function getCorrelationId(headers: Headers): string {
  return headers.get("x-correlation-id") ?? crypto.randomUUID();
}

export function getAuthenticatedActor(
  headers: Headers,
  correlationId: string,
  options?: { allowAnonymousSystemActor?: boolean },
): AuthenticatedActor {
  const actorTypeHeader = headers.get("x-actor-type");
  const actorIdHeader = headers.get("x-actor-id");

  if (!actorTypeHeader || !actorIdHeader) {
    if (options?.allowAnonymousSystemActor) {
      return {
        actorType: "system_service",
        actorId: "public_request",
      };
    }

    throw new ApiError({
      errorCode: "UNAUTHORIZED",
      status: 401,
      message: "Actor headers are required.",
      details: ["x-actor-type", "x-actor-id"],
      correlationId,
    });
  }

  const parsedActorType = actorTypeSchema.safeParse(actorTypeHeader);

  if (!parsedActorType.success) {
    throw new ApiError({
      errorCode: "VALIDATION_FAILED",
      status: 422,
      message: "Actor type is invalid.",
      details: parsedActorType.error.flatten(),
      correlationId,
    });
  }

  return {
    actorType: parsedActorType.data,
    actorId: actorIdHeader,
  };
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
