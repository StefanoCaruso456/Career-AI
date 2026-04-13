import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getAccessRequestReview } from "@/packages/access-request-domain/src";
import {
  errorResponse,
  getCorrelationId,
  resolveSessionAuthenticatedActor,
  successResponse,
} from "@/packages/audit-security/src";

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();
    const sessionActor = resolveSessionAuthenticatedActor(session?.user);
    const { requestId } = await context.params;
    const token = request.nextUrl.searchParams.get("token");
    const review = await getAccessRequestReview({
      correlationId,
      requestId,
      reviewTokenOptional: token,
      sessionActorOptional: sessionActor,
    });

    return successResponse(review, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
