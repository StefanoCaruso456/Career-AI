import { type NextRequest } from "next/server";
import { resolveAuthenticatedActorIdentity } from "@/actor-identity";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import {
  mergeApplicationProfiles,
  mergeProfileWithDefaults,
} from "@/lib/application-profiles/defaults";
import {
  applicationProfilesResponseSchema,
  updateApplicationProfileInputSchema,
  ApiError,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import {
  findPersistentContextByUserId,
  isDatabaseConfigured,
  updatePersistentApplicationProfile,
} from "@/packages/persistence/src";

export const runtime = "nodejs";

async function requireSessionContext(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);
  const session = await auth();

  if (!session?.user) {
    throw new ApiError({
      correlationId,
      details: null,
      errorCode: "UNAUTHORIZED",
      message: "A signed-in session is required.",
      status: 401,
    });
  }

  const actorIdentity = resolveAuthenticatedActorIdentity(session.user);

  if (!actorIdentity?.appUserId) {
    throw new ApiError({
      correlationId,
      details: null,
      errorCode: "UNAUTHORIZED",
      message: "A persistent Career AI user is required.",
      status: 401,
    });
  }

  return {
    actorIdentity,
    appUserId: actorIdentity.appUserId,
    correlationId,
    session,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { appUserId, correlationId } = await requireSessionContext(request);

    if (!isDatabaseConfigured()) {
      return successResponse(
        applicationProfilesResponseSchema.parse({
          persisted: false,
          profiles: mergeApplicationProfiles(null),
        }),
        correlationId,
      );
    }

    const context = await findPersistentContextByUserId({
      correlationId,
      userId: appUserId,
    });

    return successResponse(
      applicationProfilesResponseSchema.parse({
        persisted: true,
        profiles: mergeApplicationProfiles(context.applicationProfiles),
      }),
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, getCorrelationId(request.headers));
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { actorIdentity, appUserId, correlationId, session } =
      await requireSessionContext(request);
    const payload = updateApplicationProfileInputSchema.parse(await request.json());
    const normalizedProfile = mergeProfileWithDefaults(payload.schemaFamily, payload.profile);

    if (!isDatabaseConfigured()) {
      return successResponse(
        applicationProfilesResponseSchema.parse({
          persisted: false,
          profiles: mergeApplicationProfiles({
            [`${payload.schemaFamily}_profile`]: normalizedProfile,
          }),
        }),
        correlationId,
      );
    }

    await ensurePersistentCareerIdentityForSessionUser({
      correlationId,
      user: {
        appUserId: session.user.appUserId,
        authProvider: session.user.authProvider,
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        providerUserId: session.user.providerUserId,
      },
    });

    const context = await updatePersistentApplicationProfile({
      correlationId,
      profile: normalizedProfile as Record<string, unknown>,
      schemaFamily: payload.schemaFamily,
      userId: appUserId,
    });

    const auditActorId = actorIdentity.talentIdentityId ?? appUserId;

    logAuditEvent({
      actorId: auditActorId,
      actorType: "talent_user",
      correlationId,
      eventType: "candidate.application_profile.saved",
      metadataJson: {
        schema_family: payload.schemaFamily,
      },
      targetId: appUserId,
      targetType: "user",
    });

    return successResponse(
      applicationProfilesResponseSchema.parse({
        persisted: true,
        profiles: mergeApplicationProfiles(context.applicationProfiles),
      }),
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, getCorrelationId(request.headers));
  }
}
