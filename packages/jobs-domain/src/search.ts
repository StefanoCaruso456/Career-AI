import type {
  JobPostingDto,
  JobSearchQueryDto,
  JobSearchRetrievalResultDto,
  JobsPanelResponseDto,
} from "@/packages/contracts/src";
import { jobsPanelResponseSchema } from "@/packages/contracts/src";
import {
  buildJobRailCards,
  findSimilarJobsCatalog,
  getJobPostingDetails,
  parseJobSearchQuery,
  resolveJobSeekerProfileContext,
  searchJobsCatalog,
  validateJobsCatalog,
} from "./search-catalog";

function inferResultQuality(result: JobSearchRetrievalResultDto) {
  if (result.results.length === 0) {
    return "empty" as const;
  }

  if (result.resultQuality) {
    return result.resultQuality;
  }

  const topScore = result.results[0]?.relevanceScore ?? 0;

  if (topScore >= 0.82 && result.results.length >= 3) {
    return "strong" as const;
  }

  if (topScore >= 0.58 || result.results.length >= 2) {
    return "acceptable" as const;
  }

  return "weak" as const;
}

function buildAssistantMessage(args: {
  jobs: JobPostingDto[];
  query: JobSearchQueryDto;
}) {
  if (args.jobs.length === 0) {
    return "I didn’t find grounded job matches for that search in the live inventory yet. I can broaden the title, location, or workplace preference if you want.";
  }

  const roleSegment = args.query.filters.role ? ` ${args.query.filters.role}` : "";
  const workplaceSegment = args.query.filters.workplaceType ? ` ${args.query.filters.workplaceType}` : "";
  const locationSegment = args.query.filters.location ? ` in ${args.query.filters.location}` : "";
  const companySegment =
    args.query.filters.companies.length > 0
      ? ` at ${args.query.filters.companies.join(", ")}`
      : "";
  const personalizationSegment = args.query.usedCareerIdDefaults
    ? " I kept the search broad and used your Career ID context to rank the strongest matches."
    : "";
  const topMatches = args.jobs
    .slice(0, 3)
    .map((job) => {
      const location = job.location ? ` (${job.location})` : "";

      return `${job.title} at ${job.companyName}${location}`;
    })
    .join("; ");

  return `I found ${args.jobs.length} grounded${workplaceSegment}${roleSegment} job matches${locationSegment}${companySegment}.${personalizationSegment} Best fits: ${topMatches}.`;
}

export async function searchJobsPanel(args: {
  conversationId?: string | null;
  limit?: number;
  origin?: "chat_prompt" | "panel_refresh" | "cta" | "api";
  ownerId?: string | null;
  prompt: string;
  refresh?: boolean;
}): Promise<JobsPanelResponseDto> {
  const result = await searchJobsCatalog({
    conversationId: args.conversationId,
    limit: args.limit,
    origin: args.origin,
    ownerId: args.ownerId,
    prompt: args.prompt,
    refresh: args.refresh,
  });
  const resultQuality = inferResultQuality(result);

  return jobsPanelResponseSchema.parse({
    agent: {
      clarificationQuestion:
        result.results.length === 0
          ? "Do you want me to widen the title, location, or workplace preference?"
          : null,
      intent: "job_search",
      intentConfidence: 1,
      loopCount: 0,
      maxLoops: 0,
      resultQuality,
      selectedTool: "searchJobs",
      terminationReason:
        resultQuality === "empty" ? "jobs_search_completed_empty" : "jobs_search_completed",
    },
    assistantMessage: buildAssistantMessage({
      jobs: result.results,
      query: result.query,
    }),
    debugTrace: [],
    diagnostics: result.diagnostics,
    generatedAt: result.generatedAt,
    jobs: result.results,
    panelCount: result.returnedCount,
    profileContext: result.profileContext,
    query: result.query,
    rail: {
      cards: buildJobRailCards(result.results),
      emptyState: result.rail.emptyState,
    },
    totalMatches: result.totalCandidateCount,
  });
}

export {
  buildJobRailCards,
  findSimilarJobsCatalog,
  getJobPostingDetails,
  parseJobSearchQuery,
  resolveJobSeekerProfileContext,
  searchJobsCatalog,
  validateJobsCatalog,
};
