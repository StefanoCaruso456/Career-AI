import { type NextRequest } from "next/server";
import {
  assertAllowedActorTypes,
  assertTalentIdentityAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { getClaimDetails, getClaimOwnerIdentityId } from "@/packages/credential-domain/src";

type RouteContext = {
  params: Promise<{
    claimId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { claimId } = await context.params;
    const ownerIdentityId = await getClaimOwnerIdentityId({
      claimId,
      correlationId,
    });

    if (actor.actorType === "talent_user") {
      assertTalentIdentityAccess(actor, ownerIdentityId, correlationId);
    } else {
      assertAllowedActorTypes(
        actor,
        ["reviewer_admin", "system_service"],
        correlationId,
        "view claim details",
      );
    }

    return successResponse(
      getClaimDetails({
        claimId,
        correlationId,
      }),
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
