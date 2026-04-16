import type {
  JobPostingDto,
  JobSearchAppliedFiltersDto,
  JobSearchFallbackDto,
  JobSearchQueryDto,
  JobSearchQueryInterpretationDto,
  JobSearchQuerySummaryDto,
  JobSearchRankingSummaryDto,
} from "@/packages/contracts/src";
import { describeLocationMatch } from "./location-normalizer";
import type { JobSearchRequestV2, SearchResultCandidate } from "./types";
import { formatCurrency, uniqueStrings } from "./utils";

function formatAppliedFilters(request: JobSearchRequestV2) {
  return {
    companies: request.filters.company?.include ?? [],
    compensation: request.filters.compensation ?? null,
    employmentType: request.filters.employment_type?.include ?? [],
    location: request.filters.location ?? null,
    recency: request.filters.recency ?? null,
    seniority: request.filters.seniority?.include ?? [],
    skills: request.filters.skills?.include ?? [],
    team: request.filters.team?.include ?? [],
    title: request.filters.title?.include ?? [],
    workplaceType: request.filters.workplace_type?.include ?? [],
  };
}

function buildMatchReasons(candidate: SearchResultCandidate, request: JobSearchRequestV2) {
  const reasons: string[] = [];
  const locationLabel = candidate.job.location.city && candidate.job.location.state_code
    ? `${candidate.job.location.city}, ${candidate.job.location.state_code}`
    : candidate.job.location.metro ?? candidate.job.location.state ?? candidate.job.location.country;

  if (candidate.scoreBreakdown.title > 0) {
    reasons.push(`Matched title: ${candidate.job.title}`);
  }

  if (candidate.scoreBreakdown.location > 0) {
    reasons.push(
      describeLocationMatch(
        candidate.exactMatch
          ? candidate.job.location.city && candidate.job.location.state ? "city_state" : "country"
          : candidate.fallbackLabel?.includes("metro")
            ? "metro"
            : candidate.fallbackLabel?.includes("state")
              ? "state"
              : candidate.fallbackLabel?.includes("country")
                ? "country"
                : "remote",
        locationLabel,
      ),
    );
  }

  if (candidate.scoreBreakdown.recency > 0 && request.filters.recency?.label) {
    reasons.push(`Posted within ${request.filters.recency.label.replace(/_/g, " ")}`);
  }

  if (candidate.scoreBreakdown.skills > 0 && (request.filters.skills?.include?.length ?? 0) > 0) {
    reasons.push(`Matched required skills: ${(request.filters.skills?.include ?? []).join(", ")}`);
  }

  if (candidate.scoreBreakdown.team > 0 && (request.filters.team?.include?.length ?? 0) > 0) {
    reasons.push(`Matched team: ${(request.filters.team?.include ?? []).join(", ")}`);
  }

  if (candidate.scoreBreakdown.workplace > 0 && (request.filters.workplace_type?.include?.length ?? 0) > 0) {
    reasons.push(`Matched workplace type: ${(request.filters.workplace_type?.include ?? []).join(", ")}`);
  }

  if (request.filters.compensation?.min) {
    reasons.push(
      candidate.compensationKnown
        ? "Compensation meets requested minimum"
        : "Compensation not listed",
    );
  }

  if (!candidate.exactMatch && candidate.fallbackLabel) {
    reasons.push(`Fallback match after widening: ${candidate.fallbackLabel}`);
  }

  return uniqueStrings(reasons);
}

export function decorateJobPosting(candidate: SearchResultCandidate, request: JobSearchRequestV2): JobPostingDto {
  const reasons = buildMatchReasons(candidate, request);
  const salaryText =
    candidate.job.compensation.salary_min !== null || candidate.job.compensation.salary_max !== null
      ? [formatCurrency(candidate.job.compensation.salary_min, candidate.job.compensation.salary_period), formatCurrency(candidate.job.compensation.salary_max, candidate.job.compensation.salary_period)]
          .filter(Boolean)
          .join(" - ") || candidate.job.source_job.salaryText
      : candidate.job.source_job.salaryText;

  return {
    ...candidate.job.source_job,
    matchReasons: reasons,
    matchSignals: candidate.exactMatch ? ["exact_match"] : ["fallback_match"],
    matchSummary: reasons[0] ?? (candidate.exactMatch ? "Exact match" : "Fallback match"),
    rankingBreakdown: {
      employmentTypeScore: 0,
      finalScore: candidate.scoreBreakdown.total,
      freshnessScore: candidate.scoreBreakdown.recency,
      industryScore: 0,
      lexicalScore: candidate.lexicalScore.total,
      locationScore: candidate.scoreBreakdown.location,
      mismatchPenalty: 0,
      profileAlignmentScore: 0,
      remotePreferenceScore: candidate.scoreBreakdown.workplace,
      semanticScore: candidate.scoreBreakdown.semantic,
      seniorityScore: 0,
      skillOverlapScore: candidate.scoreBreakdown.skills,
      titleMatchScore: candidate.scoreBreakdown.title,
      trustScore: candidate.job.source_job.trustScore ?? 0,
    },
    relevanceScore: candidate.scoreBreakdown.total,
    salaryRange: {
      currency: candidate.job.compensation.salary_currency,
      max: candidate.job.compensation.salary_max,
      min: candidate.job.compensation.salary_min,
      rawText: salaryText ?? null,
    },
    salaryText: salaryText ?? null,
    searchReasons: reasons,
    workplaceType: candidate.job.workplace_type.value,
  };
}

export function buildLegacyAppliedFilters(request: JobSearchRequestV2, limit: number, offset: number): JobSearchAppliedFiltersDto {
  return {
    companies: request.filters.company?.include ?? [],
    employmentType: request.filters.employment_type?.include?.[0] ?? null,
    exclusions: request.filters.company?.exclude ?? [],
    industries: [],
    keywords: request.keywords,
    limit,
    location: request.filters.location?.city?.[0] ?? request.filters.location?.state?.[0] ?? null,
    locations: uniqueStrings([
      ...(request.filters.location?.city ?? []),
      ...(request.filters.location?.state ?? []),
      ...(request.filters.location?.metro ?? []),
      ...(request.filters.location?.country ?? []),
    ]),
    offset,
    postedWithinDays: request.filters.recency?.posted_within_hours
      ? Math.ceil(request.filters.recency.posted_within_hours / 24)
      : null,
    role: request.filters.title?.include?.[0] ?? null,
    roleFamilies: uniqueStrings([...(request.filters.title?.family ?? []), ...(request.filters.title?.clusters ?? [])]),
    remotePreference:
      request.filters.workplace_type?.include?.[0] === "remote"
        ? "remote_only"
        : request.filters.workplace_type?.include?.[0] === "hybrid"
          ? "hybrid_preferred"
          : request.filters.workplace_type?.include?.[0] === "onsite"
            ? "onsite_preferred"
            : null,
    rankingBoosts:
      request.sort.primary === "recency"
        ? ["freshness", "title_alignment", "trusted_source"]
        : request.sort.primary === "compensation"
          ? ["title_alignment", "trusted_source"]
          : ["title_alignment", "trusted_source"],
    salaryMax: request.filters.compensation?.max ?? null,
    salaryMin: request.filters.compensation?.min ?? null,
    seniority: request.filters.seniority?.include?.[0] ?? null,
    skills: request.filters.skills?.include ?? [],
    targetJobId: null,
    workplaceType: request.filters.workplace_type?.include?.[0] ?? null,
  };
}

export function buildLegacyQuery(request: JobSearchRequestV2, appliedFilters: JobSearchAppliedFiltersDto): JobSearchQueryDto {
  return {
    careerIdSignals: [],
    conversationContext: null,
    effectivePrompt: request.raw_query,
    filters: appliedFilters,
    normalizedPrompt: request.raw_query.toLowerCase(),
    prompt: request.raw_query,
    usedCareerIdDefaults: false,
  };
}

export function buildLegacyQueryInterpretation(
  request: JobSearchRequestV2,
  appliedFilters: JobSearchAppliedFiltersDto,
): JobSearchQueryInterpretationDto {
  return {
    adjacentRoles: request.filters.title?.clusters ?? [],
    companyTerms: request.filters.company?.include ?? [],
    employmentType: appliedFilters.employmentType,
    excludeTerms: appliedFilters.exclusions,
    industries: [],
    locations: appliedFilters.locations,
    normalizedQuery: request.raw_query.toLowerCase(),
    normalizedRoles: request.filters.title?.include ?? [],
    profileSignalsUsed: [],
    rankingBoosts: appliedFilters.rankingBoosts,
    rawQuery: request.raw_query,
    remotePreference: appliedFilters.remotePreference,
    salaryMax: appliedFilters.salaryMax,
    salaryMin: appliedFilters.salaryMin,
    semanticThemes: uniqueStrings([
      ...(request.filters.title?.family ?? []),
      ...(request.filters.title?.clusters ?? []),
      ...(request.filters.skills?.include ?? []),
      ...request.keywords,
    ]),
    seniority: appliedFilters.seniority,
    skills: appliedFilters.skills,
    workplaceType: appliedFilters.workplaceType,
  };
}

export function buildRankingSummary(request: JobSearchRequestV2): JobSearchRankingSummaryDto {
  return {
    scoringVersion: "metadata_first_v2",
    topSignals: uniqueStrings([
      ...(request.filters.title?.include?.length ? ["title_exact"] : []),
      ...(request.filters.skills?.include?.length ? ["required_skills_overlap"] : []),
      ...(request.filters.location ? ["location"] : []),
      ...(request.filters.compensation?.min || request.filters.compensation?.max ? ["compensation"] : []),
      ...(request.filters.recency ? ["recency"] : []),
    ]),
    weights: {
      employmentType: 0.05,
      freshness: 0.18,
      industry: 0,
      lexical: 0.22,
      location: 0.2,
      mismatchPenalty: 0,
      profile: 0,
      remotePreference: 0.08,
      semantic: 0.08,
      seniority: 0.05,
      skill: 0.22,
      title: 0.25,
      trust: 0.07,
    },
  };
}

export function buildQuerySummary(request: JobSearchRequestV2): JobSearchQuerySummaryDto {
  return {
    appliedFilters: formatAppliedFilters(request),
    normalizedUserIntent: "find_jobs",
  };
}

export function buildUserMessage(args: {
  exactMatchCount: number;
  fallbackMatchCount: number;
  filtersDescription: string[];
  knownCompensationCount: number;
  results: JobPostingDto[];
  unknownCompensationCount: number;
  wideningSteps: string[];
  zeroResultReasons: string[];
}) {
  if (args.results.length === 0) {
    const attempts = args.filtersDescription.length > 0 ? `I applied ${args.filtersDescription.join(", ")}.` : "I searched the active job inventory.";
    const widening = args.wideningSteps.length > 0 ? ` I also widened the search using ${args.wideningSteps.join("; ")}.` : "";
    const reasons =
      args.zeroResultReasons.length > 0 ? ` Most restrictive constraints: ${args.zeroResultReasons.join("; ")}.` : "";

    return `${attempts}${widening}${reasons} No grounded job matches were found yet.`;
  }

  const resultPrefix =
    args.fallbackMatchCount > 0
      ? `I found ${args.exactMatchCount} exact matches and ${args.fallbackMatchCount} widened fallback matches.`
      : `I found ${args.exactMatchCount} exact matches.`;
  const compensation =
    args.knownCompensationCount > 0 || args.unknownCompensationCount > 0
      ? ` ${args.knownCompensationCount} have known compensation${args.unknownCompensationCount > 0 ? ` and ${args.unknownCompensationCount} more have salary not listed` : ""}.`
      : "";
  const widening = args.wideningSteps.length > 0 ? ` Widening used: ${args.wideningSteps.join("; ")}.` : "";

  return `${resultPrefix}${compensation}${widening}`.trim();
}

export function buildFallbackState(wideningSteps: string[]): JobSearchFallbackDto {
  if (wideningSteps.length === 0) {
    return {
      applied: false,
      broadenedFields: [],
      reason: "none",
    };
  }

  const lastStep = wideningSteps[wideningSteps.length - 1] ?? "";

  return {
    applied: true,
    broadenedFields: wideningSteps.map((step) => step.split(":")[0] ?? step),
    reason: lastStep.includes("salary")
      ? "relaxed_salary"
      : lastStep.includes("role")
        ? "broadened_roles"
        : lastStep.includes("location")
          ? "relaxed_location"
          : "relaxed_seniority",
  };
}
