import { type NextRequest } from "next/server";
import { errorResponse, getCorrelationId, successResponse } from "@/packages/audit-security/src";
import { searchJobsPanel } from "@/packages/jobs-domain/src";
import { resolveChatRouteContext } from "@/app/api/chat/route-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const correlationId = getCorrelationId(request.headers);

  try {
    const { ownerId } = await resolveChatRouteContext(request);
    const prompt = request.nextUrl.searchParams.get("prompt")?.trim();
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;

    if (!prompt) {
      return successResponse(
        {
          assistantMessage: "Add a jobs question to populate the panel.",
          diagnostics: {
            duplicateCount: 0,
            filteredOutCount: 0,
            invalidCount: 0,
            searchLatencyMs: 0,
            sourceCount: 0,
            staleCount: 0,
          },
          generatedAt: new Date().toISOString(),
          jobs: [],
          panelCount: 0,
          query: {
            careerIdSignals: [],
            filters: {
              companies: [],
              industries: [],
              keywords: [],
              location: null,
              postedWithinDays: null,
              role: null,
              seniority: null,
              workplaceType: null,
            },
            normalizedPrompt: "",
            prompt: "",
            usedCareerIdDefaults: false,
          },
          totalMatches: 0,
        },
        correlationId,
      );
    }

    const response = await searchJobsPanel({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      origin: "panel_refresh",
      ownerId,
      prompt,
      refresh: true,
    });

    return successResponse(response, correlationId);
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
