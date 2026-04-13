import { type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveAccessRequestFromReview } from "@/packages/access-request-domain/src";
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

const reviewMutationInputSchema = z.object({
  noteOptional: z.string().trim().max(1000).nullable().optional().default(null),
  token: z.string().trim().min(1).nullable().optional().default(null),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();
    const sessionActor = resolveSessionAuthenticatedActor(session?.user);
    const { requestId } = await context.params;
    const payload = reviewMutationInputSchema.parse(await request.json().catch(() => ({})));
    const review = await resolveAccessRequestFromReview({
      action: "reject",
      correlationId,
      noteOptional: payload.noteOptional,
      requestId,
      reviewTokenOptional: payload.token,
      sessionActorOptional: sessionActor,
    });

    return successResponse(review, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
