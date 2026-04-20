import { type NextRequest } from "next/server";
import {
  assertAllowedActorTypes,
  assertTalentIdentityAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { deleteArtifact, getArtifactMetadata } from "@/packages/artifact-domain/src";

type RouteContext = {
  params: Promise<{
    artifactId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { artifactId } = await context.params;
    const artifact = getArtifactMetadata({
      actorId: actor.actorId,
      actorType: actor.actorType,
      artifactId,
      correlationId,
    });

    if (actor.actorType === "talent_user") {
      assertTalentIdentityAccess(actor, artifact.owner_talent_id, correlationId);
    } else {
      assertAllowedActorTypes(
        actor,
        ["reviewer_admin", "system_service"],
        correlationId,
        "view artifact metadata",
      );
    }

    return successResponse(artifact, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { artifactId } = await context.params;
    const artifact = getArtifactMetadata({
      artifactId,
      correlationId,
    });

    if (actor.actorType === "talent_user") {
      assertTalentIdentityAccess(actor, artifact.owner_talent_id, correlationId);
    } else {
      assertAllowedActorTypes(
        actor,
        ["reviewer_admin", "system_service"],
        correlationId,
        "delete artifacts",
      );
    }

    await deleteArtifact({
      actorId: actor.actorId,
      actorType: actor.actorType,
      artifactId,
      correlationId,
    });

    return successResponse(
      {
        artifactId,
        deleted: true,
      },
      correlationId,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
