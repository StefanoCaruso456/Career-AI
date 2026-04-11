import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { searchEmployerCandidatesInputSchema } from "@/packages/contracts/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const payload = searchEmployerCandidatesInputSchema.parse(await request.json());
    const response = await searchEmployerCandidates({
      filters: payload.filters,
      limit: payload.limit,
      prompt: payload.prompt,
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
