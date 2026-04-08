import { type NextRequest } from "next/server";
import { updatePrivacySettingsInputSchema } from "@/packages/contracts/src";
import {
  assertTalentIdentityAccess,
  errorResponse,
  getAuthenticatedActor,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { toTalentIdentityDetailsDto, updatePrivacySettings } from "@/packages/identity-domain/src";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = getAuthenticatedActor(request.headers, correlationId);
    const { id } = await context.params;
    assertTalentIdentityAccess(actor, id, correlationId);
    const body = updatePrivacySettingsInputSchema.parse(await request.json());
    const aggregate = updatePrivacySettings({
      talentIdentityId: id,
      input: body,
      actorType:
        actor.actorType === "talent_user" ? actor.actorType : "system_service",
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(toTalentIdentityDetailsDto(aggregate), correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
