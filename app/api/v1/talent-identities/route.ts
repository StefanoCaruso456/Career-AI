import { type NextRequest } from "next/server";
import { createTalentIdentityInputSchema } from "@/packages/contracts/src";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { createTalentIdentity, toTalentIdentitySummaryDto } from "@/packages/identity-domain/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId, {
      allowPublic: true,
    });
    const body = createTalentIdentityInputSchema.parse(await request.json());
    const aggregate = await createTalentIdentity({
      input: body,
      actorType:
        actor.actorType === "talent_user" ? actor.actorType : "system_service",
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(toTalentIdentitySummaryDto(aggregate), correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
