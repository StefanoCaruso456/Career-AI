import { type NextRequest } from "next/server";
import { createEmploymentClaimInputSchema } from "@/packages/contracts/src";
import {
  assertAllowedActorTypes,
  assertTalentIdentityAccess,
  errorResponse,
  getAuthenticatedActor,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { createEmploymentClaim } from "@/packages/credential-domain/src";
import { getTalentIdentityBySoulRecordId } from "@/packages/identity-domain/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = getAuthenticatedActor(request.headers, correlationId);
    assertAllowedActorTypes(
      actor,
      ["talent_user", "system_service"],
      correlationId,
      "create employment claims",
    );
    const body = createEmploymentClaimInputSchema.parse(await request.json());
    const owner = getTalentIdentityBySoulRecordId({
      soulRecordId: body.soulRecordId,
      correlationId,
    });

    if (actor.actorType === "talent_user") {
      assertTalentIdentityAccess(actor, owner.talentIdentity.id, correlationId);
    }

    const result = createEmploymentClaim({
      input: body,
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(
      {
        claimId: result.claim.id,
        employmentRecordId: result.employmentRecord.id,
        verificationStatus: result.verificationRecord.status,
      },
      correlationId,
      201,
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
