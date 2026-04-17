import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError } from "@/packages/contracts/src";
import { getGovernmentIdVerificationStatus } from "@/packages/career-id-domain/src";

type RouteContext = {
  params: Promise<{
    verificationId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user?.email) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "Sign in to access Career ID verification.",
        correlationId,
      });
    }

    const { verificationId } = await context.params;
    const result = await getGovernmentIdVerificationStatus({
      verificationId,
      viewer: {
        email: session.user.email,
        name: session.user.name,
        talentIdentityId: session.user.talentIdentityId,
      },
      correlationId,
    });

    return successResponse(result, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
