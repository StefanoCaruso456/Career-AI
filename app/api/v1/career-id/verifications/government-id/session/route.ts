import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError, createGovernmentIdVerificationSessionInputSchema } from "@/packages/contracts/src";
import { createGovernmentIdVerificationSession } from "@/packages/career-id-domain/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user?.email) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "Sign in to verify your identity.",
        correlationId,
      });
    }

    const body = createGovernmentIdVerificationSessionInputSchema.parse(await request.json());
    const result = await createGovernmentIdVerificationSession({
      viewer: {
        email: session.user.email,
        name: session.user.name,
        talentIdentityId: session.user.talentIdentityId,
      },
      input: body,
      requestOrigin: request.nextUrl.origin,
      correlationId,
    });

    return successResponse(result, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
