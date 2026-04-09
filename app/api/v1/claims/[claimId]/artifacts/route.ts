import { type NextRequest } from "next/server";
import { ApiError, attachArtifactToClaimInputSchema } from "@/packages/contracts/src";
import {
  assertAllowedActorTypes,
  assertTalentIdentityAccess,
  errorResponse,
  getAuthenticatedActor,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { attachArtifactToClaim, getArtifactMetadata } from "@/packages/artifact-domain/src";
import { attachArtifactToEmploymentClaim, getClaimOwnerIdentityId } from "@/packages/credential-domain/src";

type RouteContext = {
  params: Promise<{
    claimId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = getAuthenticatedActor(request.headers, correlationId);
    assertAllowedActorTypes(
      actor,
      ["talent_user", "system_service"],
      correlationId,
      "attach artifacts to claims",
    );
    const { claimId } = await context.params;
    const ownerIdentityId = await getClaimOwnerIdentityId({
      claimId,
      correlationId,
    });

    if (actor.actorType === "talent_user") {
      assertTalentIdentityAccess(actor, ownerIdentityId, correlationId);
    }

    const body = attachArtifactToClaimInputSchema.parse(await request.json());
    const artifact = getArtifactMetadata({
      artifactId: body.artifactId,
      correlationId,
    });

    if (artifact.owner_talent_id !== ownerIdentityId) {
      throw new ApiError({
        errorCode: "CONFLICT",
        status: 409,
        message: "Artifact owner does not match claim owner.",
        correlationId,
      });
    }

    attachArtifactToClaim({
      claimId,
      artifactId: body.artifactId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    const result = attachArtifactToEmploymentClaim({
      claimId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(result, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
