import { type NextRequest } from "next/server";
import { generateShareQrInputSchema } from "@/packages/contracts/src";
import {
  assertAllowedActorTypes,
  assertTalentIdentityAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import {
  generateShareProfileQr,
  getShareProfileOwnerIdentityId,
} from "@/packages/recruiter-read-model/src";

type RouteContext = {
  params: Promise<{
    shareProfileKey: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    assertAllowedActorTypes(
      actor,
      ["talent_user", "system_service"],
      correlationId,
      "generate share profile QR payloads",
    );
    const { shareProfileKey } = await context.params;
    const ownerIdentityId = getShareProfileOwnerIdentityId({
      profileId: shareProfileKey,
      correlationId,
    });

    if (actor.actorType === "talent_user") {
      assertTalentIdentityAccess(actor, ownerIdentityId, correlationId);
    }

    const rawBody = await request.text();
    const body = generateShareQrInputSchema.parse(
      rawBody ? (JSON.parse(rawBody) as unknown) : {},
    );
    const payload = await generateShareProfileQr({
      profileId: shareProfileKey,
      input: {
        ...body,
        baseUrlOptional: body.baseUrlOptional ?? request.nextUrl.origin,
      },
      actorType: actor.actorType,
      actorId: actor.actorId,
      correlationId,
    });

    return successResponse(payload, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
