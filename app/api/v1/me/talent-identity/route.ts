import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { ApiError } from "@/packages/contracts/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { toTalentIdentityDetailsDto } from "@/packages/identity-domain/src";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "You must be signed in to access your Career AI identity.",
        details: null,
        correlationId,
      });
    }

    const { context } = await ensurePersistentCareerIdentityForSessionUser({
      user: {
        appUserId: session.user.appUserId,
        authProvider: session.user.authProvider,
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        providerUserId: session.user.providerUserId,
      },
      correlationId,
    });

    return successResponse(toTalentIdentityDetailsDto(context.aggregate), correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
