import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { ApiError } from "@/packages/contracts/src";
import { getCareerBuilderWorkspace } from "@/packages/career-builder-domain/src";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user?.email) {
      throw new ApiError({
        errorCode: "UNAUTHORIZED",
        status: 401,
        message: "Sign in to access your Career ID.",
        correlationId,
      });
    }

    const snapshot = await getCareerBuilderWorkspace({
      viewer: {
        email: session.user.email,
        name: session.user.name,
      },
      correlationId,
    });

    return successResponse(snapshot.careerIdProfile, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
