import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { ensureTalentIdentityForSessionUser } from "@/auth-identity";
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

    const aggregate = ensureTalentIdentityForSessionUser({
      user: {
        email: session.user.email,
        name: session.user.name,
      },
      correlationId,
    });

    return successResponse(toTalentIdentityDetailsDto(aggregate), correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
