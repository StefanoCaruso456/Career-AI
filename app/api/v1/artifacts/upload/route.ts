import { type NextRequest } from "next/server";
import { ApiError } from "@/packages/contracts/src";
import {
  assertAllowedActorTypes,
  errorResponse,
  getAuthenticatedActor,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { uploadArtifact } from "@/packages/artifact-domain/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = getAuthenticatedActor(request.headers, correlationId);
    assertAllowedActorTypes(
      actor,
      ["talent_user", "system_service"],
      correlationId,
      "upload artifacts",
    );

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError({
        errorCode: "VALIDATION_FAILED",
        status: 422,
        message: "A file field is required.",
        details: { field: "file" },
        correlationId,
      });
    }

    const ownerTalentId =
      actor.actorType === "talent_user"
        ? actor.actorId
        : String(formData.get("ownerTalentId") ?? "");

    if (!ownerTalentId) {
      throw new ApiError({
        errorCode: "VALIDATION_FAILED",
        status: 422,
        message: "ownerTalentId is required for non-talent uploads.",
        details: { field: "ownerTalentId" },
        correlationId,
      });
    }

    const result = await uploadArtifact({
      file,
      ownerTalentId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(result.dto, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
