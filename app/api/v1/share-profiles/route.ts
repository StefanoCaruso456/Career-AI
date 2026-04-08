import { type NextRequest } from "next/server";
import { generateShareProfileInputSchema } from "@/packages/contracts/src";
import {
  assertAllowedActorTypes,
  assertTalentIdentityAccess,
  errorResponse,
  getAuthenticatedActor,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { generateRecruiterTrustProfile } from "@/packages/recruiter-read-model/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = getAuthenticatedActor(request.headers, correlationId);
    assertAllowedActorTypes(
      actor,
      ["talent_user", "system_service"],
      correlationId,
      "generate share profiles",
    );
    const body = generateShareProfileInputSchema.parse(await request.json());

    if (actor.actorType === "talent_user") {
      assertTalentIdentityAccess(actor, body.talentIdentityId, correlationId);
    }

    const profile = generateRecruiterTrustProfile({
      input: {
        ...body,
        baseUrlOptional: body.baseUrlOptional ?? request.nextUrl.origin,
      },
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(profile, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
