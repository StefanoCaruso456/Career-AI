import { z } from "zod";
import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { ApiError } from "@/packages/contracts/src";
import { getEmployerCandidateTrace } from "@/packages/recruiter-read-model/src";

export const dynamic = "force-dynamic";

const traceLookupSchema = z.object({
  candidateId: z.string().trim().min(1).optional(),
  careerId: z.string().trim().min(1).optional(),
  lookup: z.string().trim().min(1).optional(),
  shareProfileId: z.string().trim().min(1).optional(),
  shareToken: z.string().trim().min(1).optional(),
});

function resolveLookupValue(searchParams: z.infer<typeof traceLookupSchema>) {
  return (
    searchParams.lookup?.trim() ||
    searchParams.careerId?.trim() ||
    searchParams.candidateId?.trim() ||
    searchParams.shareProfileId?.trim() ||
    searchParams.shareToken?.trim() ||
    null
  );
}

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const payload = traceLookupSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const lookup = resolveLookupValue(payload);

    if (!lookup) {
      throw new ApiError({
        correlationId,
        details: ["lookup", "careerId", "candidateId", "shareProfileId", "shareToken"],
        errorCode: "VALIDATION_FAILED",
        message: "A candidate lookup is required.",
        status: 422,
      });
    }

    const response = await getEmployerCandidateTrace({
      correlationId,
      input: {
        baseUrlOptional: request.nextUrl.origin,
        lookup,
      },
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
