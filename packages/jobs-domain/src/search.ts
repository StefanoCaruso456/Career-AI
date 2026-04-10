import type {
  JobPostingDto,
  JobSearchFiltersDto,
  JobSearchOrigin,
  JobSearchQueryDto,
  JobsPanelResponseDto,
  JobSourceTrustTier,
  JobValidationStatus,
} from "@/packages/contracts/src";
import { jobsPanelResponseSchema } from "@/packages/contracts/src";
import {
  findPersistentContextByEmail,
  findPersistentContextByTalentIdentityId,
  getPersistedJobPostingById,
  getPersistedJobsFeedSnapshot,
  getPersistentCareerBuilderProfile,
  isDatabaseConfigured,
  recordJobSearchEvent,
  recordJobValidationEvents,
} from "@/packages/persistence/src";
import {
  createJobDedupeFingerprint,
  evaluateJobValidation,
  inferJobWorkplaceType,
  normalizeHumanLabel,
} from "./metadata";
import { getJobsFeedSnapshot } from "./service";

const DEFAULT_PANEL_LIMIT = 8;
const DEFAULT_SEARCH_WINDOW_DAYS = 30;

type CandidateProfileDefaults = {
  headline: string | null;
  location: string | null;
  signals: string[];
  targetRole: string | null;
};

type SearchableJobSnapshot = {
  jobs: JobPostingDto[];
  sourceCount: number;
};

type ValidationSnapshot = ReturnType<typeof evaluateJobValidation>;

type SearchableJob = {
  job: JobPostingDto;
  score: number;
};

function splitEntityList(value: string) {
  return value
    .replace(/\band\b/gi, ",")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function stripSearchClauses(value: string) {
  return value
    .replace(/\b(new|latest|recent|recently posted|recently)\b/gi, " ")
    .replace(/\b(remote|hybrid|onsite|on-site)\b/gi, " ")
    .replace(/\b(?:at|from)\s+[a-z0-9&.,' -]+$/i, " ")
    .replace(/\b(?:in|near|around)\s+[a-z0-9&.,' -]+$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompanies(prompt: string) {
  const match = prompt.match(
    /\b(?:at|from)\s+([a-z0-9&.,' -]+?)(?=(?:\s+\b(?:in|near|around|remote|hybrid|onsite|posted|with|for)\b|[.?!]|$))/i,
  );

  if (!match?.[1]) {
    return [];
  }

  return splitEntityList(match[1]).slice(0, 6);
}

function extractLocation(prompt: string) {
  const match = prompt.match(
    /\b(?:in|near|around)\s+([a-z0-9&.,' -]+?)(?=(?:\s+\b(?:at|from|remote|hybrid|onsite|posted|with|for)\b|[.?!]|$))/i,
  );

  return match?.[1]?.trim() || null;
}

function extractRole(prompt: string) {
  const match = prompt.match(
    /\b(?:find|show me|search(?: for)?|surface|pull)\s+(.+?)\s+\b(?:jobs|roles|positions|openings)\b/i,
  );

  if (!match?.[1]) {
    return null;
  }

  const stripped = stripSearchClauses(match[1]);

  return stripped.length > 0 && stripped.toLowerCase() !== "me" ? stripped : null;
}

function extractSeniority(prompt: string) {
  const match = prompt.match(
    /\b(entry|junior|associate|mid|senior|staff|principal|lead|director|head|vp|vice president)\b/i,
  );

  return match?.[1]?.trim() || null;
}

function extractPostedWithinDays(prompt: string) {
  const normalizedPrompt = normalizeHumanLabel(prompt);

  if (normalizedPrompt.includes("today")) {
    return 1;
  }

  if (
    normalizedPrompt.includes("new job") ||
    normalizedPrompt.includes("new jobs") ||
    normalizedPrompt.includes("recent") ||
    normalizedPrompt.includes("recently posted") ||
    normalizedPrompt.includes("this week")
  ) {
    return 7;
  }

  if (normalizedPrompt.includes("this month") || normalizedPrompt.includes("last 30 days")) {
    return 30;
  }

  return null;
}

function extractKeywords(role: string | null, prompt: string) {
  const seed = role ?? prompt;

  return Array.from(
    new Set(
      seed
        .toLowerCase()
        .split(/[^a-z0-9+.#-]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .filter((token) => !["find", "show", "jobs", "roles", "positions", "openings", "new"].includes(token)),
    ),
  ).slice(0, 12);
}

function parseJobSearchQuery(args: {
  prompt: string;
  candidateDefaults: CandidateProfileDefaults | null;
}): JobSearchQueryDto {
  const prompt = args.prompt.trim();
  const normalizedPrompt = normalizeHumanLabel(prompt);
  const companies = extractCompanies(prompt);
  const location = extractLocation(prompt);
  const role = extractRole(prompt);
  const seniority = extractSeniority(prompt);
  const postedWithinDays = extractPostedWithinDays(prompt);
  const workplaceType = normalizedPrompt.includes("remote")
    ? "remote"
    : normalizedPrompt.includes("hybrid")
      ? "hybrid"
      : normalizedPrompt.includes("onsite") || normalizedPrompt.includes("on-site")
        ? "onsite"
        : null;
  const keywords = extractKeywords(role, prompt);
  const filters: JobSearchFiltersDto = {
    companies,
    industries: [],
    keywords,
    location,
    postedWithinDays,
    role,
    seniority,
    workplaceType,
  };
  const isGenericPrompt =
    companies.length === 0 &&
    !location &&
    !role &&
    !seniority &&
    !workplaceType &&
    (normalizedPrompt.includes("for me") || normalizedPrompt === "find new jobs" || normalizedPrompt === "find new jobs for me");

  if (isGenericPrompt && args.candidateDefaults) {
    return {
      careerIdSignals: args.candidateDefaults.signals,
      filters: {
        ...filters,
        keywords:
          filters.keywords.length > 0
            ? filters.keywords
            : extractKeywords(
                args.candidateDefaults.targetRole ?? args.candidateDefaults.headline,
                args.candidateDefaults.targetRole ?? args.candidateDefaults.headline ?? prompt,
              ),
        location: filters.location ?? args.candidateDefaults.location,
        role: filters.role ?? args.candidateDefaults.targetRole ?? args.candidateDefaults.headline,
      },
      normalizedPrompt,
      prompt,
      usedCareerIdDefaults: true,
    };
  }

  return {
    careerIdSignals: args.candidateDefaults?.signals ?? [],
    filters,
    normalizedPrompt,
    prompt,
    usedCareerIdDefaults: false,
  };
}

async function resolveCandidateProfileDefaults(ownerId: string | null | undefined) {
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
    const onboardingHeadline =
      typeof context.onboarding.profile.headline === "string"
        ? context.onboarding.profile.headline.trim()
        : null;
    const onboardingLocation =
      typeof context.onboarding.profile.location === "string"
        ? context.onboarding.profile.location.trim()
        : null;
    const signals = [
      careerProfile?.targetRole,
      careerProfile?.location,
      careerProfile?.careerHeadline,
      onboardingHeadline,
      onboardingLocation,
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => value.trim());

    return {
      headline: careerProfile?.careerHeadline ?? onboardingHeadline,
      location: careerProfile?.location ?? onboardingLocation,
      signals,
      targetRole: careerProfile?.targetRole ?? onboardingHeadline,
    } satisfies CandidateProfileDefaults;
  } catch {
    return null;
  }
}

async function getSearchableJobSnapshot(args: {
  refresh: boolean;
  windowDays: number | null;
}): Promise<SearchableJobSnapshot> {
  if (!isDatabaseConfigured()) {
    const snapshot = await getJobsFeedSnapshot({
      limit: 5_000,
      windowDays: args.windowDays ?? DEFAULT_SEARCH_WINDOW_DAYS,
    });

    return {
      jobs: snapshot.jobs,
      sourceCount: snapshot.sources.length,
    };
  }

  if (args.refresh) {
    await getJobsFeedSnapshot({
      limit: 5_000,
      windowDays: args.windowDays ?? DEFAULT_SEARCH_WINDOW_DAYS,
    });
  }

  const persisted = await getPersistedJobsFeedSnapshot({
    limit: 5_000,
    windowDays: args.windowDays ?? 90,
  });

  if (persisted.jobs.length > 0) {
    return {
      jobs: persisted.jobs,
      sourceCount: persisted.sources.length,
    };
  }

  const liveSnapshot = await getJobsFeedSnapshot({
    limit: 5_000,
    windowDays: args.windowDays ?? DEFAULT_SEARCH_WINDOW_DAYS,
  });

  return {
    jobs: liveSnapshot.jobs,
    sourceCount: liveSnapshot.sources.length,
  };
}

function jobMatchesCompanies(job: JobPostingDto, companies: string[]) {
  if (companies.length === 0) {
    return true;
  }

  const haystack = [job.companyName, job.normalizedCompanyName].filter(Boolean).join(" ").toLowerCase();

  return companies.some((company) => haystack.includes(company.trim().toLowerCase()));
}

function jobMatchesLocation(job: JobPostingDto, location: string | null) {
  if (!location) {
    return true;
  }

  return normalizeHumanLabel(job.location ?? "").includes(normalizeHumanLabel(location));
}

function jobMatchesWorkplace(job: JobPostingDto, workplaceType: JobSearchFiltersDto["workplaceType"]) {
  if (!workplaceType) {
    return true;
  }

  return inferJobWorkplaceType(job.location) === workplaceType || job.workplaceType === workplaceType;
}

function jobMatchesRecency(job: JobPostingDto, postedWithinDays: number | null) {
  if (!postedWithinDays) {
    return true;
  }

  const timestamp = Date.parse(job.updatedAt || job.postedAt || "");

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= postedWithinDays * 24 * 60 * 60 * 1000;
}

function jobMatchesRole(job: JobPostingDto, filters: JobSearchFiltersDto) {
  if (!filters.role && filters.keywords.length === 0 && !filters.seniority) {
    return true;
  }

  const haystack = [
    job.title,
    job.normalizedTitle,
    job.descriptionSnippet,
    job.department,
    job.companyName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const roleMatch = filters.role ? haystack.includes(filters.role.toLowerCase()) : false;
  const seniorityMatch = filters.seniority ? haystack.includes(filters.seniority.toLowerCase()) : false;
  const keywordMatch =
    filters.keywords.length === 0 ||
    filters.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));

  return roleMatch || seniorityMatch || keywordMatch;
}

function buildSearchReasons(args: {
  filters: JobSearchFiltersDto;
  job: JobPostingDto;
  validation: ValidationSnapshot;
}) {
  const reasons: string[] = [];

  if (args.validation.validationStatus === "active_verified") {
    reasons.push("trusted_direct_source");
  }

  if (args.filters.role && normalizeHumanLabel(args.job.title).includes(normalizeHumanLabel(args.filters.role))) {
    reasons.push("title_match");
  }

  if (args.filters.companies.length > 0 && jobMatchesCompanies(args.job, args.filters.companies)) {
    reasons.push("company_match");
  }

  if (args.filters.location && jobMatchesLocation(args.job, args.filters.location)) {
    reasons.push("location_match");
  }

  if (args.filters.workplaceType && jobMatchesWorkplace(args.job, args.filters.workplaceType)) {
    reasons.push("workplace_match");
  }

  if (jobMatchesRecency(args.job, 7)) {
    reasons.push("fresh_posting");
  }

  return reasons;
}

function scoreJob(args: {
  candidateDefaults: CandidateProfileDefaults | null;
  filters: JobSearchFiltersDto;
  job: JobPostingDto;
  validation: ValidationSnapshot;
}) {
  const timestamp = Date.parse(args.job.updatedAt || args.job.postedAt || "");
  const freshnessScore = Number.isNaN(timestamp)
    ? 0
    : Math.max(0, 1 - (Date.now() - timestamp) / (DEFAULT_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  let score = (args.validation.trustScore ?? 0) * 55 + freshnessScore * 20;

  if (args.filters.role && normalizeHumanLabel(args.job.title).includes(normalizeHumanLabel(args.filters.role))) {
    score += 25;
  }

  if (args.filters.seniority && normalizeHumanLabel(args.job.title).includes(normalizeHumanLabel(args.filters.seniority))) {
    score += 8;
  }

  if (args.filters.companies.length > 0 && jobMatchesCompanies(args.job, args.filters.companies)) {
    score += 18;
  }

  if (args.filters.location && jobMatchesLocation(args.job, args.filters.location)) {
    score += 14;
  }

  if (args.filters.workplaceType && jobMatchesWorkplace(args.job, args.filters.workplaceType)) {
    score += 10;
  }

  if (args.filters.keywords.length > 0 && jobMatchesRole(args.job, args.filters)) {
    score += 12;
  }

  if (args.candidateDefaults?.targetRole) {
    const normalizedTargetRole = normalizeHumanLabel(args.candidateDefaults.targetRole);

    if (normalizeHumanLabel(args.job.title).includes(normalizedTargetRole)) {
      score += 10;
    }
  }

  if (args.candidateDefaults?.location && jobMatchesLocation(args.job, args.candidateDefaults.location)) {
    score += 6;
  }

  return score;
}

function buildAssistantMessage(args: {
  jobs: JobPostingDto[];
  query: JobSearchQueryDto;
}) {
  if (args.jobs.length === 0) {
    return `I did not find any high-confidence jobs for that search yet. I filtered out stale, duplicate, and low-trust listings, so try widening the title or location and I will rerun it.`;
  }

  const roleSegment = args.query.filters.role ? ` ${args.query.filters.role}` : "";
  const workplaceSegment = args.query.filters.workplaceType ? ` ${args.query.filters.workplaceType}` : "";
  const locationSegment = args.query.filters.location ? ` in ${args.query.filters.location}` : "";
  const companySegment =
    args.query.filters.companies.length > 0
      ? ` at ${args.query.filters.companies.join(", ")}`
      : "";
  const personalizationSegment = args.query.usedCareerIdDefaults
    ? " I used your Career ID defaults to shape the search."
    : "";

  return `I found ${args.jobs.length} high-confidence${workplaceSegment}${roleSegment} jobs${locationSegment}${companySegment}. I prioritized validated, fresh listings and deduped the feed so the jobs rail is showing the strongest matches first.${personalizationSegment}`;
}

function mergeValidationIntoJob(args: {
  job: JobPostingDto;
  reasons: string[];
  validation: ValidationSnapshot;
}) {
  return {
    ...args.job,
    applicationPathType: args.validation.applicationPathType,
    canonicalApplyUrl: args.validation.canonicalApplyUrl ?? args.job.canonicalApplyUrl ?? args.job.applyUrl,
    canonicalJobUrl: args.validation.canonicalJobUrl ?? args.job.canonicalJobUrl ?? null,
    dedupeFingerprint:
      args.job.dedupeFingerprint ??
      createJobDedupeFingerprint({
        applyUrl: args.validation.canonicalApplyUrl ?? args.job.applyUrl,
        companyName: args.job.companyName,
        externalSourceJobId: args.job.externalSourceJobId ?? args.job.externalId,
        location: args.job.location,
        title: args.job.title,
      }),
    lastValidatedAt: new Date().toISOString(),
    orchestrationReadiness: args.validation.orchestrationReadiness,
    redirectRequired: args.validation.redirectRequired,
    searchReasons: args.reasons,
    sourceTrustTier: args.validation.sourceTrustTier,
    trustScore: args.validation.trustScore,
    validationStatus: args.validation.validationStatus,
    workplaceType: args.job.workplaceType ?? inferJobWorkplaceType(args.job.location),
  } satisfies JobPostingDto;
}

export async function searchJobsPanel(args: {
  conversationId?: string | null;
  limit?: number;
  origin?: JobSearchOrigin;
  ownerId?: string | null;
  prompt: string;
  refresh?: boolean;
}): Promise<JobsPanelResponseDto> {
  const startedAt = Date.now();
  const candidateDefaults = await resolveCandidateProfileDefaults(args.ownerId);
  const query = parseJobSearchQuery({
    candidateDefaults,
    prompt: args.prompt,
  });
  const snapshot = await getSearchableJobSnapshot({
    refresh: args.refresh ?? false,
    windowDays: query.filters.postedWithinDays,
  });
  const rankedJobs: SearchableJob[] = [];
  const seenFingerprints = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;
  let staleCount = 0;
  let filteredOutCount = 0;

  for (const job of snapshot.jobs) {
    const validation = evaluateJobValidation({
      canonicalApplyUrl: job.canonicalApplyUrl ?? job.applyUrl,
      canonicalJobUrl: job.canonicalJobUrl ?? null,
      companyName: job.companyName,
      descriptionSnippet: job.descriptionSnippet,
      externalId: job.externalId,
      location: job.location,
      postedAt: job.postedAt,
      sourceLane: job.sourceLane,
      sourceQuality: job.sourceQuality,
      title: job.title,
      updatedAt: job.updatedAt,
      workplaceType: job.workplaceType ?? inferJobWorkplaceType(job.location),
    });

    if (validation.validationStatus === "invalid" || validation.validationStatus === "expired") {
      invalidCount += 1;
      filteredOutCount += 1;
      continue;
    }

    if (validation.validationStatus === "stale") {
      staleCount += 1;
      filteredOutCount += 1;
      continue;
    }

    const dedupeFingerprint =
      job.dedupeFingerprint ??
      createJobDedupeFingerprint({
        applyUrl: validation.canonicalApplyUrl ?? job.applyUrl,
        companyName: job.companyName,
        externalSourceJobId: job.externalSourceJobId ?? job.externalId,
        location: job.location,
        title: job.title,
      });

    if (seenFingerprints.has(dedupeFingerprint)) {
      duplicateCount += 1;
      filteredOutCount += 1;
      continue;
    }

    if (
      !jobMatchesCompanies(job, query.filters.companies) ||
      !jobMatchesLocation(job, query.filters.location) ||
      !jobMatchesWorkplace(job, query.filters.workplaceType) ||
      !jobMatchesRecency(job, query.filters.postedWithinDays) ||
      !jobMatchesRole(job, query.filters)
    ) {
      filteredOutCount += 1;
      continue;
    }

    seenFingerprints.add(dedupeFingerprint);
    const reasons = buildSearchReasons({
      filters: query.filters,
      job,
      validation,
    });
    const mergedJob = mergeValidationIntoJob({
      job,
      reasons,
      validation,
    });

    rankedJobs.push({
      job: mergedJob,
      score: scoreJob({
        candidateDefaults,
        filters: query.filters,
        job: mergedJob,
        validation,
      }),
    });
  }

  rankedJobs.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    return (right.job.trustScore ?? 0) - (left.job.trustScore ?? 0);
  });

  const limit = Math.max(1, Math.min(args.limit ?? DEFAULT_PANEL_LIMIT, 12));
  const jobs = rankedJobs.slice(0, limit).map((entry) => entry.job);
  const searchLatencyMs = Date.now() - startedAt;
  const response = jobsPanelResponseSchema.parse({
    assistantMessage: buildAssistantMessage({
      jobs,
      query,
    }),
    diagnostics: {
      duplicateCount,
      filteredOutCount,
      invalidCount,
      searchLatencyMs,
      sourceCount: snapshot.sourceCount,
      staleCount,
    },
    generatedAt: new Date().toISOString(),
    jobs,
    panelCount: jobs.length,
    query,
    totalMatches: rankedJobs.length,
  });

  if (isDatabaseConfigured() && args.ownerId) {
    await Promise.all([
      recordJobSearchEvent({
        conversationId: args.conversationId ?? null,
        latencyMs: searchLatencyMs,
        origin: args.origin ?? "api",
        ownerId: args.ownerId,
        prompt: args.prompt,
        query: response.query,
        resultCount: response.totalMatches,
        resultJobIds: response.jobs.map((job) => job.id),
      }),
      recordJobValidationEvents({
        events: response.jobs.map((job) => ({
          jobId: job.id,
          reasonCodes: job.searchReasons ?? [],
          sourceTrustTier: (job.sourceTrustTier ?? "unknown") as JobSourceTrustTier,
          trustScore: job.trustScore ?? 0,
          validationStatus: (job.validationStatus ?? "active_unverified") as JobValidationStatus,
        })),
        observedAt: response.generatedAt,
      }),
    ]);
  }

  return response;
}

export async function getJobPostingDetails(args: {
  jobId: string;
}) {
  if (isDatabaseConfigured()) {
    const persisted = await getPersistedJobPostingById({
      jobId: args.jobId,
    });

    if (persisted) {
      return persisted;
    }
  }

  const liveSnapshot = await getJobsFeedSnapshot({
    limit: 5_000,
    windowDays: 90,
  });

  return liveSnapshot.jobs.find((job) => job.id === args.jobId) ?? null;
}

export async function validateJobsCatalog(args?: {
  jobIds?: string[];
  limit?: number;
}) {
  const snapshot = isDatabaseConfigured()
    ? await getPersistedJobsFeedSnapshot({
        limit: args?.limit ?? 100,
        windowDays: 90,
      })
    : await getJobsFeedSnapshot({
        limit: args?.limit ?? 100,
        windowDays: 90,
      });
  const selectedJobs =
    args?.jobIds && args.jobIds.length > 0
      ? snapshot.jobs.filter((job) => args.jobIds?.includes(job.id))
      : snapshot.jobs.slice(0, args?.limit ?? 100);
  const results = selectedJobs.map((job) => {
    const validation = evaluateJobValidation({
      canonicalApplyUrl: job.canonicalApplyUrl ?? job.applyUrl,
      canonicalJobUrl: job.canonicalJobUrl ?? null,
      companyName: job.companyName,
      descriptionSnippet: job.descriptionSnippet,
      externalId: job.externalId,
      location: job.location,
      postedAt: job.postedAt,
      sourceLane: job.sourceLane,
      sourceQuality: job.sourceQuality,
      title: job.title,
      updatedAt: job.updatedAt,
      workplaceType: job.workplaceType ?? inferJobWorkplaceType(job.location),
    });

    return mergeValidationIntoJob({
      job,
      reasons: validation.reasons,
      validation,
    });
  });

  if (isDatabaseConfigured()) {
    await recordJobValidationEvents({
      events: results.map((job) => ({
        jobId: job.id,
        reasonCodes: job.searchReasons ?? [],
        sourceTrustTier: (job.sourceTrustTier ?? "unknown") as JobSourceTrustTier,
        trustScore: job.trustScore ?? 0,
        validationStatus: (job.validationStatus ?? "active_unverified") as JobValidationStatus,
      })),
    });
  }

  return results;
}
