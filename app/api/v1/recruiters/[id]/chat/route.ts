import { type NextRequest } from "next/server";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { recruiterChatInputSchema } from "@/packages/contracts/src";
import { sendRecruiterScopedChatMessage } from "@/packages/recruiter-marketplace-domain/src";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const payload = recruiterChatInputSchema.parse(await request.json());
    const { id } = await context.params;
    const response = await sendRecruiterScopedChatMessage({
      actor,
      conversationIdOptional: payload.conversationId,
      correlationId,
      message: payload.message,
      mode: payload.mode,
      recruiterCareerIdentityId: id,
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
