import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { listEmployerPartnersForDiscovery } from "@/packages/recruiter-marketplace-domain/src";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const items = await listEmployerPartnersForDiscovery();
    return successResponse({ items }, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
