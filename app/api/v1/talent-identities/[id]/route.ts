import { type NextRequest } from "next/server";
import {
  assertTalentIdentityAccess,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { getTalentIdentity, toTalentIdentityDetailsDto } from "@/packages/identity-domain/src";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { id } = await context.params;
    assertTalentIdentityAccess(actor, id, correlationId);
    const aggregate = await getTalentIdentity({
      talentIdentityId: id,
      correlationId,
    });

    return successResponse(toTalentIdentityDetailsDto(aggregate), correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
