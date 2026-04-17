import { type NextRequest } from "next/server";
import {
  errorResponse,
  getCorrelationId,
  successResponse,
} from "@/packages/audit-security/src";
import { handlePersonaWebhook } from "@/packages/career-id-domain/src";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const rawBody = await request.text();
    const result = await handlePersonaWebhook({
      rawBody,
      signatureHeader: request.headers.get("Persona-Signature"),
      correlationId,
    });

    return successResponse(result, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
