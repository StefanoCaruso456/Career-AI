import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError, createGovernmentIdVerificationSessionInputSchema } from "@/packages/contracts/src";
import { retryGovernmentIdEvidence } from "@/packages/career-id-domain/src";

type RouteContext = {
  params: Promise<{
    evidenceId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user?.email) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "Sign in to retry Career ID verification.",
        correlationId,
      });
    }

    const { evidenceId } = await context.params;
    const body = createGovernmentIdVerificationSessionInputSchema.parse(await request.json());
    const result = await retryGovernmentIdEvidence({
      evidenceId,
      viewer: {
        email: session.user.email,
        name: session.user.name,
        talentIdentityId: session.user.talentIdentityId,
      },
      input: body,
      requestOrigin: request.nextUrl.origin,
      correlationId,
    });

    return successResponse(result, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
