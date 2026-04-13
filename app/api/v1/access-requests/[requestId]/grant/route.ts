import { type NextRequest } from "next/server";
import { resolveAccessRequestInputSchema } from "@/packages/contracts/src";
import {
  errorResponse,
  getCorrelationId,
  grantScopedAccessRequest,
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
    const payload = resolveAccessRequestInputSchema.parse(await request.json());
    const accessGrant = await grantScopedAccessRequest({
      actor,
      correlationId,
      expiresAt: payload.expiresAtOptional,
      note: payload.note,
      requestId,
    });

    return successResponse(accessGrant, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
