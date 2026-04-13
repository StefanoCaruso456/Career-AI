import { type NextRequest } from "next/server";
import { revokeAccessRequestGrant } from "@/packages/access-request-domain/src";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { requestId } = await context.params;
    const body = (await request.json().catch(() => null)) as { noteOptional?: string | null } | null;

    const review = await revokeAccessRequestGrant({
      actor,
      correlationId,
      noteOptional: body?.noteOptional ?? null,
      requestId,
    });

    return successResponse(review, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
