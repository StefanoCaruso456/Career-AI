import { type NextRequest } from "next/server";
import { auth } from "@/auth";
import { createAutonomousApplyRun } from "@/packages/apply-domain/src";
import { createApplyRunInputSchema, createApplyRunResponseSchema, ApiError } from "@/packages/contracts/src";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { kickAutonomousApplyWorker } from "@/packages/apply-runtime/src";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const session = await auth();

    if (!session?.user) {
      throw new ApiError({
        correlationId,
        details: null,
        errorCode: "UNAUTHORIZED",
        message: "A signed-in session is required.",
        status: 401,
      });
    }

    const input = createApplyRunInputSchema.parse(await request.json());
    const result = await createAutonomousApplyRun({
      correlationId,
      input,
      sessionUser: {
        appUserId: session.user.appUserId,
        authProvider: session.user.authProvider,
        email: session.user.email,
        emailVerified: true,
        image: session.user.image,
        name: session.user.name,
        providerUserId: session.user.providerUserId,
      },
    });

    void kickAutonomousApplyWorker();

    return successResponse(
      createApplyRunResponseSchema.parse({
        applyRunId: result.run.id,
        deduped: result.deduped,
        featureFlagName: result.run.featureFlagName ?? "AUTONOMOUS_APPLY_ENABLED",
        message: "Your application was queued. We will email you when it finishes.",
        status: "queued",
      }),
      correlationId,
      201,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
