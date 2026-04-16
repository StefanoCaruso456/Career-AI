import {
  type JobPostingDto,
  jobSearchRetrievalResultSchema,
} from "@/packages/contracts/src";
import {
  findPersistentContextByEmail,
  findPersistentContextByTalentIdentityId,
  getPersistedJobsFeedSnapshot,
  getPersistentCareerBuilderProfile,
  isDatabaseConfigured,
  recordJobSearchEvent,
} from "@/packages/persistence/src";
import { getJobsFeedSnapshot } from "../service";
import { mapJobsToCanonicalRecords } from "./canonical-mapper";
import { normalizeJobSearchRequest } from "./filter-normalizer";
import { isJobSearchRetrievalV2Enabled } from "./feature-flag";
import {
  buildFallbackState,
  buildLegacyAppliedFilters,
  buildLegacyQuery,
  buildLegacyQueryInterpretation,
  buildQuerySummary,
  buildRankingSummary,
  buildUserMessage,
  decorateJobPosting,
} from "./explainer";
import { createSearchObservability } from "./observability";
import { parseJobSearchRequest } from "./query-parser";
import { applyHardFilters } from "./retrieval-engine";
import { rerankCandidates } from "./reranker";
import type {
  JobSearchCatalogV2Args,
  JobSearchRuntimeResult,
  JobSearchRequestV2,
  SearchResultCandidate,
} from "./types";

const MAX_SEARCH_WINDOW_DAYS = 90;
const DEFAULT_PANEL_LIMIT = 24;

function createProfileContext(profile: {
  careerIdentityId: string | null;
  headline: string | null;
  location: string | null;
  signals: string[];
  targetRole: string | null;
} | null) {
  if (!profile) {
    return null;
  }

  return {
    available: true,
    careerIdentityId: profile.careerIdentityId,
    headline: profile.headline,
    location: profile.location,
    signals: profile.signals,
    targetRole: profile.targetRole,
  };
}

async function resolveJobSeekerProfileContext(ownerId: string | null | undefined) {
  if (!ownerId?.startsWith("user:") || !isDatabaseConfigured()) {
    return null;
  }

  const identifier = ownerId.slice("user:".length);

  try {
    const context = identifier.includes("@")
      ? await findPersistentContextByEmail({
          correlationId: `jobs_profile_${identifier}`,
          email: identifier,
        })
      : await findPersistentContextByTalentIdentityId({
          correlationId: `jobs_profile_${identifier}`,
          talentIdentityId: identifier,
        });
    const careerProfile = await getPersistentCareerBuilderProfile({
      careerIdentityId: context.aggregate.talentIdentity.id,
      soulRecordId: context.aggregate.soulRecord.id,
    });
    const headline =
      careerProfile?.careerHeadline ??
      (typeof context.onboarding.profile.headline === "string" ? context.onboarding.profile.headline.trim() : null);
    const location =
      careerProfile?.location ??
      (typeof context.onboarding.profile.location === "string" ? context.onboarding.profile.location.trim() : null);
    const signals = [
      careerProfile?.targetRole,
      careerProfile?.location,
      careerProfile?.careerHeadline,
      headline,
      location,
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => value.trim());

    return {
      careerIdentityId: context.aggregate.talentIdentity.id,
      headline,
      location,
      signals,
      targetRole: careerProfile?.targetRole ?? headline,
    };
  } catch {
    return null;
  }
}

async function getSearchableJobSnapshot(args: {
  refresh: boolean;
  windowDays: number | null;
}) {
  if (!isDatabaseConfigured()) {
    const snapshot = await getJobsFeedSnapshot({
      limit: 5_000,
      windowDays: args.windowDays ?? 30,
    });

    return {
      jobs: snapshot.jobs,
      sourceCount: snapshot.sources.length,
    };
  }

  if (args.refresh) {
    await getJobsFeedSnapshot({
      limit: 5_000,
      windowDays: args.windowDays ?? 30,
    });
  }

  const persisted = await getPersistedJobsFeedSnapshot({
    limit: 5_000,
    windowDays: args.windowDays ?? MAX_SEARCH_WINDOW_DAYS,
  });

  if (persisted.jobs.length > 0) {
    return {
      jobs: persisted.jobs,
      sourceCount: persisted.sources.length,
    };
  }

  const live = await getJobsFeedSnapshot({
    limit: 5_000,
    windowDays: args.windowDays ?? 30,
  });

  return {
    jobs: live.jobs,
    sourceCount: live.sources.length,
  };
}

function convertLegacyQuery(query: NonNullable<JobSearchCatalogV2Args["query"]>): JobSearchRequestV2 {
  return normalizeJobSearchRequest({
    filters: {
      company: query.filters.companies.length > 0 ? { include: query.filters.companies } : undefined,
      compensation:
        query.filters.salaryMin || query.filters.salaryMax
          ? {
              currency: "USD",
              max: query.filters.salaryMax ?? undefined,
              min: query.filters.salaryMin ?? undefined,
              period: "yearly",
              strict_minimum: Boolean(query.filters.salaryMin),
            }
          : undefined,
      employment_type: query.filters.employmentType ? { include: [query.filters.employmentType as never] } : undefined,
      location: query.filters.location
        ? {
            city: [query.filters.location],
          }
        : undefined,
      recency: query.filters.postedWithinDays
        ? {
            label:
              query.filters.postedWithinDays <= 1
                ? "last_24_hours"
                : query.filters.postedWithinDays <= 3
                  ? "last_3_days"
                  : "last_7_days",
            posted_since: new Date(Date.now() - query.filters.postedWithinDays * 24 * 60 * 60 * 1_000).toISOString(),
            posted_within_hours: query.filters.postedWithinDays * 24,
          }
        : undefined,
      seniority: query.filters.seniority ? { include: [query.filters.seniority as never] } : undefined,
      skills: query.filters.skills.length > 0 ? { include: query.filters.skills, required: query.filters.skills } : undefined,
      title:
        query.filters.role || query.filters.roleFamilies.length > 0
          ? {
              family: query.filters.roleFamilies,
              include: query.filters.role ? [query.filters.role] : [],
            }
          : undefined,
      workplace_type: query.filters.workplaceType ? { include: [query.filters.workplaceType as never] } : undefined,
    },
    intent: "find_jobs",
    keywords: query.filters.keywords,
    raw_query: query.effectivePrompt ?? query.prompt,
    sort: {
      primary: query.filters.postedWithinDays ? "recency" : "relevance",
      secondary: "relevance",
    },
    widening_policy: {
      enabled: true,
      minimum_exact_matches: 1,
    },
  });
}

function buildWidenedRequest(request: JobSearchRequestV2, wideningSteps: string[]) {
  const nextRequest: JobSearchRequestV2 = {
    ...request,
    filters: {
      ...request.filters,
      compensation: request.filters.compensation ? { ...request.filters.compensation } : undefined,
      location: request.filters.location ? { ...request.filters.location } : undefined,
      recency: request.filters.recency ? { ...request.filters.recency } : undefined,
      title: request.filters.title
        ? {
            ...request.filters.title,
            clusters: [...(request.filters.title.clusters ?? [])],
            family: [...(request.filters.title.family ?? [])],
            include: [...(request.filters.title.include ?? [])],
          }
        : undefined,
    },
  };
  const location = nextRequest.filters.location;
  const recency = nextRequest.filters.recency;
  const title = nextRequest.filters.title;
  let changed = false;

  if (location?.city?.length && location.metro?.length && !wideningSteps.some((step) => step.includes("metro"))) {
    delete location.city;
    wideningSteps.push(`location: widened city/state to metro (${location.metro[0]})`);
    changed = true;
    return nextRequest;
  }

  if ((location?.city?.length || location?.metro?.length) && location?.state?.length && !wideningSteps.some((step) => step.includes("state"))) {
    delete location.city;
    delete location.metro;
    wideningSteps.push(`location: widened to state (${location.state[0]})`);
    changed = true;
    return nextRequest;
  }

  if (location?.state?.length && location.country?.length && !wideningSteps.some((step) => step.includes("country"))) {
    delete location.state;
    delete location.state_code;
    wideningSteps.push(`location: widened to country (${location.country[0]})`);
    changed = true;
    return nextRequest;
  }

  if (location && !location.allow_remote_fallback && !wideningSteps.some((step) => step.includes("remote"))) {
    location.allow_remote_fallback = true;
    wideningSteps.push("location: widened to remote fallback");
    changed = true;
    return nextRequest;
  }

  if (recency?.label === "last_24_hours" && !wideningSteps.some((step) => step.includes("recency"))) {
    nextRequest.filters.recency = {
      label: "last_3_days",
      posted_since: new Date(Date.now() - 72 * 60 * 60 * 1_000).toISOString(),
      posted_within_hours: 72,
    };
    wideningSteps.push("recency: widened from last 24 hours to last 3 days");
    changed = true;
    return nextRequest;
  }

  if ((recency?.label === "last_3_days" || recency?.label === "today") && !wideningSteps.some((step) => step.includes("last 7 days"))) {
    nextRequest.filters.recency = {
      label: "last_7_days",
      posted_since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      posted_within_hours: 168,
    };
    wideningSteps.push("recency: widened to last 7 days");
    changed = true;
    return nextRequest;
  }

  if (title?.include?.length && title.family?.length && !wideningSteps.some((step) => step.includes("title family"))) {
    title.include = uniqueTitleValues(title.family);
    wideningSteps.push(`title: widened to title family (${title.family.join(", ")})`);
    changed = true;
    return nextRequest;
  }

  if (title?.clusters?.length && !wideningSteps.some((step) => step.includes("role cluster"))) {
    title.include = uniqueTitleValues([...(title.include ?? []), ...title.clusters]);
    wideningSteps.push(`title: widened to broader role cluster (${title.clusters.join(", ")})`);
    changed = true;
    return nextRequest;
  }

  if (
    nextRequest.filters.compensation?.min &&
    !nextRequest.filters.compensation.strict_minimum &&
    !wideningSteps.some((step) => step.includes("10%"))
  ) {
    nextRequest.filters.compensation.min = Math.round(nextRequest.filters.compensation.min * 0.9);
    wideningSteps.push("salary: widened minimum threshold by 10%");
    changed = true;
    return nextRequest;
  }

  return changed ? nextRequest : request;
}

function uniqueTitleValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildRailCards(results: JobPostingDto[]) {
  return results.map((job) => ({
    applyUrl: job.canonicalApplyUrl ?? job.applyUrl,
    company: job.companyName,
    jobId: job.id,
    location: job.location,
    matchReason: job.matchSummary ?? job.matchReasons?.[0] ?? "Grounded match",
    relevanceScore: job.relevanceScore ?? null,
    salaryText: job.salaryText ?? null,
    summary: job.descriptionSnippet ?? null,
    title: job.title,
    workplaceType: job.workplaceType ?? null,
  }));
}

function inferResultQuality(args: {
  exactCount: number;
  fallbackCount: number;
  results: JobPostingDto[];
}) {
  if (args.results.length === 0) {
    return "empty" as const;
  }

  if (args.exactCount >= 3 && (args.results[0]?.relevanceScore ?? 0) >= 0.74) {
    return "strong" as const;
  }

  if (args.exactCount >= 1 || args.fallbackCount >= 2) {
    return "acceptable" as const;
  }

  return "weak" as const;
}

export async function searchJobsCatalogV2(args: JobSearchCatalogV2Args): Promise<JobSearchRuntimeResult> {
  const parseStartedAt = Date.now();
  const profileDefaults = args.profileContext
    ? {
        careerIdentityId: args.profileContext.careerIdentityId,
        headline: args.profileContext.headline,
        location: args.profileContext.location,
        signals: args.profileContext.signals,
        targetRole: args.profileContext.targetRole,
      }
    : await resolveJobSeekerProfileContext(args.ownerId);
  const profileContext = args.profileContext ?? createProfileContext(profileDefaults);
  const parsedRequest = args.query ? convertLegacyQuery(args.query) : parseJobSearchRequest(args.prompt ?? "");
  const normalizedRequest = normalizeJobSearchRequest(parsedRequest);
  const parseLatency = Date.now() - parseStartedAt;

  const windowDays = normalizedRequest.filters.recency?.posted_within_hours
    ? Math.max(1, Math.ceil(normalizedRequest.filters.recency.posted_within_hours / 24))
    : null;
  const loadStartedAt = Date.now();
  const snapshot = await getSearchableJobSnapshot({
    refresh: args.refresh ?? false,
    windowDays,
  });
  const loadLatency = Date.now() - loadStartedAt;

  const canonicalStartedAt = Date.now();
  const canonicalJobs = mapJobsToCanonicalRecords(snapshot.jobs);
  const canonicalLatency = Date.now() - canonicalStartedAt;

  const retrievalStartedAt = Date.now();
  const exactMatches = applyHardFilters(canonicalJobs, normalizedRequest);
  const exactRanked = rerankCandidates(exactMatches, normalizedRequest, {
    exactMatch: true,
  });
  const wideningSteps: string[] = [];
  let widenedRequest = normalizedRequest;
  let fallbackRanked: SearchResultCandidate[] = [];

  while (
    normalizedRequest.widening_policy.enabled &&
    exactRanked.length + fallbackRanked.length < normalizedRequest.widening_policy.minimum_exact_matches
  ) {
    const nextRequest = buildWidenedRequest(widenedRequest, wideningSteps);

    if (nextRequest === widenedRequest) {
      break;
    }

    widenedRequest = nextRequest;
    const fallbackMatches = applyHardFilters(canonicalJobs, widenedRequest, {
      allowUnknownCompensation: Boolean(widenedRequest.filters.compensation),
      relaxedMinimumPercentage: 1,
    });
    fallbackRanked = rerankCandidates(fallbackMatches, widenedRequest, {
      exactMatch: false,
      fallbackLabel: wideningSteps[wideningSteps.length - 1] ?? null,
    }).filter(
      (candidate) => !exactRanked.some((exactCandidate) => exactCandidate.job.job_id === candidate.job.job_id),
    );
  }

  if (normalizedRequest.filters.compensation) {
    const unknownCompensationMatches = applyHardFilters(canonicalJobs, normalizedRequest, {
      allowUnknownCompensation: true,
    })
      .filter((candidate) => !candidate.compensationKnown)
      .filter((candidate) => !exactRanked.some((exactCandidate) => exactCandidate.job.job_id === candidate.job.job_id));

    const unknownCompensationRanked = rerankCandidates(unknownCompensationMatches, normalizedRequest, {
      exactMatch: false,
      fallbackLabel: "salary: included roles with salary not listed",
    });

    fallbackRanked = [...fallbackRanked, ...unknownCompensationRanked].filter(
      (candidate, index, allCandidates) =>
        allCandidates.findIndex((entry) => entry.job.job_id === candidate.job.job_id) === index,
    );
  }

  const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_PANEL_LIMIT, 24));
  const offset = Math.max(0, args.offset ?? 0);
  const exactDecorated = exactRanked.map((candidate) => decorateJobPosting(candidate, normalizedRequest));
  const fallbackDecorated = fallbackRanked.map((candidate) => decorateJobPosting(candidate, widenedRequest));
  const combinedResults = [...exactDecorated, ...fallbackDecorated].slice(offset, offset + limit);
  const retrievalLatency = Date.now() - retrievalStartedAt;

  const querySummary = buildQuerySummary(normalizedRequest);
  const appliedFilters = buildLegacyAppliedFilters(normalizedRequest, limit, offset);
  const query = buildLegacyQuery(normalizedRequest, appliedFilters);
  const queryInterpretation = buildLegacyQueryInterpretation(normalizedRequest, appliedFilters);
  const rankingSummary = buildRankingSummary(normalizedRequest);
  const zeroResultReasons =
    combinedResults.length === 0
      ? [
          normalizedRequest.filters.location ? "location filter eliminated all candidates" : null,
          normalizedRequest.filters.compensation ? "compensation filter eliminated known salary matches" : null,
          normalizedRequest.filters.recency ? "recency filter eliminated current openings" : null,
        ].filter((value): value is string => Boolean(value))
      : [];
  const resultQuality = inferResultQuality({
    exactCount: exactDecorated.length,
    fallbackCount: fallbackDecorated.length,
    results: combinedResults,
  });
  const totalLatency = parseLatency + loadLatency + canonicalLatency + retrievalLatency;
  const observability = createSearchObservability({
    candidateCountsByStage: {
      active_inventory: canonicalJobs.length,
      exact_after_hard_filters: exactMatches.length,
      exact_after_rerank: exactRanked.length,
      fallback_after_rerank: fallbackRanked.length,
      results_returned: combinedResults.length,
    },
    latencyBreakdownMs: {
      canonicalize: canonicalLatency,
      load: loadLatency,
      parse: parseLatency,
      retrieve_and_rerank: retrievalLatency,
    },
    totalLatencyMs: totalLatency,
    wideningSteps,
    zeroResultReasons,
  });
  const knownCompensationCount = combinedResults.filter((job) => job.salaryRange?.min !== null || job.salaryRange?.max !== null).length;
  const unknownCompensationCount = combinedResults.length - knownCompensationCount;
  const assistantMessage = buildUserMessage({
    exactMatchCount: exactDecorated.length,
    fallbackMatchCount: fallbackDecorated.length,
    filtersDescription: Object.entries(querySummary.appliedFilters)
      .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value)))
      .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)}`),
    knownCompensationCount,
    results: combinedResults,
    unknownCompensationCount,
    wideningSteps,
    zeroResultReasons,
  });
  const generatedAt = new Date().toISOString();
  const fallbackApplied = buildFallbackState(wideningSteps);

  if (isDatabaseConfigured() && args.ownerId) {
    await recordJobSearchEvent({
      candidateCounts: observability.candidateCountsByStage,
      conversationId: args.conversationId ?? null,
      engineVersion: "metadata_first_v2",
      latencyBreakdownMs: observability.latencyBreakdownMs,
      latencyMs: totalLatency,
      origin: args.origin ?? "api",
      ownerId: args.ownerId,
      prompt: normalizedRequest.raw_query,
      query,
      querySummary,
      resultCount: exactDecorated.length + fallbackDecorated.length,
      resultJobIds: combinedResults.map((job) => job.id),
      wideningSteps,
      zeroResultReasons,
    });
  }

  const parsedResult = jobSearchRetrievalResultSchema.parse({
    appliedFilters,
    debugMeta: {
      candidateCountAfterFiltering: exactMatches.length,
      candidateCountAfterMerging: exactRanked.length + fallbackRanked.length,
      candidateCountsByStage: observability.candidateCountsByStage,
      duplicateCount: Math.max(0, snapshot.jobs.length - canonicalJobs.length),
      engineVersion: "metadata_first_v2",
      fallbackApplied,
      filteredOutCount: Math.max(0, canonicalJobs.length - exactMatches.length),
      invalidCount: canonicalJobs.filter((job) => job.status !== "active").length,
      latencyBreakdownMs: observability.latencyBreakdownMs,
      lexicalCandidateCount: exactRanked.filter((candidate) => candidate.scoreBreakdown.total >= 0.2).length,
      mergedCandidateCount: exactRanked.length + fallbackRanked.length,
      searchLatencyMs: totalLatency,
      semanticCandidateCount: exactRanked.filter((candidate) => candidate.scoreBreakdown.semantic > 0.15).length,
      sourceCount: snapshot.sourceCount,
      staleCount: canonicalJobs.filter((job) => job.source_job.validationStatus === "stale").length,
      structuredCandidateCount: exactMatches.length,
      wideningSteps,
      zeroResultReasons,
    },
    diagnostics: {
      duplicateCount: Math.max(0, snapshot.jobs.length - canonicalJobs.length),
      filteredOutCount: Math.max(0, canonicalJobs.length - exactMatches.length),
      invalidCount: canonicalJobs.filter((job) => job.status !== "active").length,
      searchLatencyMs: totalLatency,
      sourceCount: snapshot.sourceCount,
      staleCount: canonicalJobs.filter((job) => job.source_job.validationStatus === "stale").length,
    },
    fallbackApplied,
    generatedAt,
    profileContext,
    query,
    queryInterpretation,
    querySummary,
    rail: {
      cards: buildRailCards(combinedResults),
      emptyState: combinedResults.length === 0 ? assistantMessage : null,
      filterOptions: {
        companies: uniqueTitleValues(combinedResults.map((job) => job.companyName)).slice(0, 10),
        locations: uniqueTitleValues(combinedResults.map((job) => job.location ?? "")).slice(0, 10),
      },
    },
    rankingSummary,
    resultQuality,
    results: combinedResults,
    returnedCount: combinedResults.length,
    searchOutcome: {
      exactMatchCount: exactDecorated.length,
      fallbackMatchCount: fallbackDecorated.length,
      knownCompensationCount,
      totalCandidatesBeforeRerank: exactMatches.length,
      totalResultsReturned: combinedResults.length,
      unknownCompensationCount,
      wideningApplied: wideningSteps.length > 0,
      wideningSteps,
      zeroResultReasons,
    },
    totalCandidateCount: exactDecorated.length + fallbackDecorated.length,
  });

  return {
    ...parsedResult,
    assistantMessage,
  } as JobSearchRuntimeResult;
}

export async function browseLatestJobsCatalogV2(args?: Omit<JobSearchCatalogV2Args, "prompt" | "query">) {
  return searchJobsCatalogV2({
    ...args,
    prompt: "Find new jobs",
  });
}

export { isJobSearchRetrievalV2Enabled };
