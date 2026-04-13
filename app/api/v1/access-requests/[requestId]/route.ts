import { type NextRequest } from "next/server";
import { ApiError } from "@/packages/contracts/src";
import { getAccessRequestRecordForNotification } from "@/packages/access-request-domain/src";
import {
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";

type RouteContext = {
  params: Promise<{
    requestId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const { requestId } = await context.params;
    const record = await getAccessRequestRecordForNotification({
      requestId,
    });

    if (!record) {
      throw new ApiError({
        errorCode: "NOT_FOUND",
        status: 404,
        message: "Access request was not found.",
        details: {
          requestId,
        },
        correlationId,
      });
    }

    const isCandidateOwner =
      actor.actorType === "talent_user" && actor.actorId === record.subjectTalentIdentityId;
    const isRequester = actor.identity?.appUserId === record.requesterUserId;

    if (!(isCandidateOwner || isRequester || actor.actorType === "system_service")) {
      throw new ApiError({
        errorCode: "FORBIDDEN",
        status: 403,
        message: "You do not have permission to view this access request.",
        details: null,
        correlationId,
      });
    }

    return successResponse(record, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
