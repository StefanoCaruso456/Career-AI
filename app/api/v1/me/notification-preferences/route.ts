import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  getCandidateNotificationPreferences,
  updateCandidateNotificationPreferences,
} from "@/packages/access-request-domain/src";
import {
  ApiError,
  updateCandidateNotificationPreferencesInputSchema,
} from "@/packages/contracts/src";
import {
  errorResponse,
  getCorrelationId,
  resolveSessionAuthenticatedActor,
  successResponse,
} from "@/packages/audit-security/src";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();
    const actor = resolveSessionAuthenticatedActor(session?.user);

    if (!actor?.identity?.talentIdentityId) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "A candidate session is required.",
        details: null,
        correlationId,
      });
    }

    const preferences = await getCandidateNotificationPreferences({
      correlationId,
      talentIdentityId: actor.identity.talentIdentityId,
    });

    return successResponse(preferences, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function PATCH(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();
    const actor = resolveSessionAuthenticatedActor(session?.user);

    if (!actor?.identity?.talentIdentityId) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "A candidate session is required.",
        details: null,
        correlationId,
      });
    }

    const payload = updateCandidateNotificationPreferencesInputSchema.parse(await request.json());
    const preferences = await updateCandidateNotificationPreferences({
      actor,
      correlationId,
      input: payload,
      talentIdentityId: actor.identity.talentIdentityId,
    });

    return successResponse(preferences, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
