import { type NextRequest } from "next/server";
import { createAccessRequestInputSchema } from "@/packages/contracts/src";
import { listCandidateAccessRequests, listRecruiterAccessRequests } from "@/packages/access-request-domain/src";
import {
  createScopedAccessRequest,
  errorResponse,
  getCorrelationId,
  resolveVerifiedActor,
  successResponse,
} from "@/packages/audit-security/src";
import { deliverAccessRequestCreatedNotifications } from "@/lib/notifications/access-request-notifier";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const view = request.nextUrl.searchParams.get("view")?.trim().toLowerCase();
    const subjectTalentIdentityId =
      request.nextUrl.searchParams.get("subjectTalentIdentityId")?.trim() || null;
    const response =
      view === "requester"
        ? await listRecruiterAccessRequests({
            actor,
            correlationId,
            subjectTalentIdentityId,
          })
        : await listCandidateAccessRequests({
            actor,
            correlationId,
          });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const actor = await resolveVerifiedActor(request, correlationId);
    const payload = createAccessRequestInputSchema.parse(await request.json());
    const accessRequest = await createScopedAccessRequest({
      actor,
      correlationId,
      justification: payload.justification,
      metadataJsonOptional: payload.requestedDurationDaysOptional
        ? {
            requested_duration_days: payload.requestedDurationDaysOptional,
          }
        : undefined,
      organizationId: payload.organizationId,
      scope: payload.scope,
      subjectTalentIdentityId: payload.subjectTalentIdentityId,
    });

    try {
      await deliverAccessRequestCreatedNotifications({
        actor,
        correlationId,
        requestId: accessRequest.id,
      });
    } catch (error) {
      console.error("Failed to deliver access-request notifications.", error);
    }

    return successResponse(accessRequest, correlationId, 201);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
