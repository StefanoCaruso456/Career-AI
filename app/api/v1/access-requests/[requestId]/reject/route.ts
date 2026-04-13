import { type NextRequest } from "next/server";
import { resolveAccessRequestInputSchema } from "@/packages/contracts/src";
import {
  errorResponse,
  getCorrelationId,
  rejectScopedAccessRequest,
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
    const accessRequest = await rejectScopedAccessRequest({
      actor,
      correlationId,
      note: payload.note,
      requestId,
    });

    return successResponse(accessRequest, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
