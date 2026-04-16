import type {
  JobPostingDto,
  JobSeekerToolName,
  JobSearchQueryDto,
  JobSearchRetrievalResultDto,
  JobSearchQuerySummaryDto,
  JobSearchOutcomeDto,
  JobsPanelResponseDto,
} from "@/packages/contracts/src";
import { jobsPanelResponseSchema } from "@/packages/contracts/src";
import {
  browseLatestJobsCatalog as browseLatestJobsCatalogLegacy,
  buildLatestJobsBrowseQuery,
  buildJobRailCards,
  findSimilarJobsCatalog,
  getJobPostingDetails,
  parseJobSearchQuery,
  resolveJobSeekerProfileContext,
  searchJobsCatalog as searchJobsCatalogLegacy,
  validateJobsCatalog,
} from "./search-catalog";
import {
  browseLatestJobsCatalogV2,
  isJobSearchRetrievalV2Enabled,
  searchJobsCatalogV2,
} from "./job-search-retrieval/service";

type SearchJobsCatalogResponse = JobSearchRetrievalResultDto & {
  assistantMessage?: string;
  querySummary?: JobSearchQuerySummaryDto;
  searchOutcome?: JobSearchOutcomeDto;
};

function isNewestJobsBrowseQuery(query: JobSearchQueryDto) {
  return (
    !query.filters.role &&
    query.filters.skills.length === 0 &&
    !query.filters.location &&
    query.filters.companies.length === 0 &&
    !query.filters.workplaceType &&
    /(?:\bnew jobs?\b|\blatest jobs?\b|\brecent jobs?\b|\brecently posted\b)/i.test(
      query.normalizedPrompt,
    )
  );
}

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
  fallbackCount?: number;
  jobs: JobPostingDto[];
  query: JobSearchQueryDto;
  searchOutcome?: JobSearchOutcomeDto;
}) {
  const isNewestBrowse = isNewestJobsBrowseQuery(args.query);

  if (args.jobs.length === 0) {
    if (args.searchOutcome?.zeroResultReasons?.length) {
      return `I found no grounded job matches yet. I applied the requested filters and ${args.searchOutcome.wideningApplied ? `widened via ${args.searchOutcome.wideningSteps.join("; ")}` : "kept the search exact"} before hitting these blockers: ${args.searchOutcome.zeroResultReasons.join("; ")}.`;
    }

    if (isNewestBrowse) {
      return "I couldn’t find any live jobs across the connected sources right now.";
    }

    return "I didn’t find grounded job matches for that search in the live inventory yet. I can broaden the title, location, or workplace preference if you want.";
  }

  if (isNewestBrowse) {
    const latestRoles = args.jobs
      .slice(0, 3)
      .map((job) => `${job.title} at ${job.companyName}`)
      .join("; ");

    return `Here are the newest live jobs across all connected sources. Latest roles: ${latestRoles}.`;
  }

  if (args.searchOutcome) {
    const compensationSuffix =
      args.searchOutcome.knownCompensationCount || args.searchOutcome.unknownCompensationCount
        ? ` ${args.searchOutcome.knownCompensationCount ?? 0} have known compensation${(args.searchOutcome.unknownCompensationCount ?? 0) > 0 ? ` and ${args.searchOutcome.unknownCompensationCount} do not list salary` : ""}.`
        : "";
    const wideningSuffix = args.searchOutcome.wideningApplied
      ? ` Widening used: ${args.searchOutcome.wideningSteps.join("; ")}.`
      : "";

    return `I found ${args.searchOutcome.exactMatchCount} exact matches and ${args.searchOutcome.fallbackMatchCount} fallback matches.${compensationSuffix}${wideningSuffix}`.trim();
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

function buildJobsPanelResponse(args: {
  result: SearchJobsCatalogResponse;
  selectedTool: JobSeekerToolName;
  terminationReason: string;
}) {
  const resultQuality = inferResultQuality(args.result);
  const assistantMessage =
    args.result.assistantMessage ??
    buildAssistantMessage({
      jobs: args.result.results,
      query: args.result.query,
      searchOutcome: args.result.searchOutcome,
    });
  const isNewestBrowse = isNewestJobsBrowseQuery(args.result.query);

  return jobsPanelResponseSchema.parse({
    agent: {
      clarificationQuestion:
        resultQuality === "empty" && !isNewestBrowse
          ? "Do you want me to widen the title, location, or workplace preference?"
          : null,
      intent: "job_search",
      intentConfidence: 1,
      loopCount: 0,
      maxLoops: 0,
      resultQuality,
      selectedTool: args.selectedTool,
      terminationReason: args.terminationReason,
    },
    assistantMessage,
    debugTrace: [],
    diagnostics: args.result.diagnostics,
    generatedAt: args.result.generatedAt,
    jobs: args.result.results,
    panelCount: args.result.returnedCount,
    profileContext: args.result.profileContext,
    query: args.result.query,
    querySummary: args.result.querySummary,
    rail: {
      cards: buildJobRailCards(args.result.results),
      emptyState:
        resultQuality === "empty" && isNewestBrowse
          ? assistantMessage
          : args.result.rail.emptyState,
      filterOptions: args.result.rail.filterOptions,
    },
    searchOutcome: args.result.searchOutcome,
    totalMatches: args.result.totalCandidateCount,
  });
}

export async function searchJobsCatalog(args: Parameters<typeof searchJobsCatalogLegacy>[0]): Promise<SearchJobsCatalogResponse> {
  if (isJobSearchRetrievalV2Enabled()) {
    return searchJobsCatalogV2(args);
  }

  return searchJobsCatalogLegacy(args);
}

export async function browseLatestJobsCatalog(
  args?: Parameters<typeof browseLatestJobsCatalogLegacy>[0],
): Promise<SearchJobsCatalogResponse> {
  if (isJobSearchRetrievalV2Enabled()) {
    return browseLatestJobsCatalogV2(args);
  }

  return browseLatestJobsCatalogLegacy(args);
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

  return buildJobsPanelResponse({
    result,
    selectedTool: "searchJobs",
    terminationReason:
      inferResultQuality(result) === "empty"
        ? "jobs_search_completed_empty"
        : "jobs_search_completed",
  });
}

export async function browseLatestJobsPanel(args?: {
  conversationId?: string | null;
  limit?: number;
  ownerId?: string | null;
  prompt?: string;
  refresh?: boolean;
}): Promise<JobsPanelResponseDto> {
  const result = await browseLatestJobsCatalog({
    conversationId: args?.conversationId,
    limit: args?.limit,
    origin: args?.refresh ? "panel_refresh" : "cta",
    ownerId: args?.ownerId,
    prompt: args?.prompt,
    refresh: args?.refresh,
  });

  return buildJobsPanelResponse({
    result,
    selectedTool: "browseLatestJobs",
    terminationReason:
      inferResultQuality(result) === "empty"
        ? "latest_jobs_browse_empty"
        : "latest_jobs_browse_completed",
  });
}

export {
  buildLatestJobsBrowseQuery,
  buildJobRailCards,
  findSimilarJobsCatalog,
  getJobPostingDetails,
  parseJobSearchQuery,
  resolveJobSeekerProfileContext,
  validateJobsCatalog,
};
