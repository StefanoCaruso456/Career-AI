import type {
  JobPostingDto,
  JobRailCardDto,
  JobSearchFiltersDto,
  JobSearchOrigin,
  JobSearchQueryDto,
  JobSearchRetrievalResultDto,
  JobSeekerProfileContextDto,
} from "@/packages/contracts/src";
import { jobSearchRetrievalResultSchema } from "@/packages/contracts/src";
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
import { formatJobMatchReason } from "@/lib/jobs/format-job-match-reason";
import {
  buildRetrievalEmptyState,
  buildRetrievalRailCards,
  runHybridJobSearch,
} from "./search-engine";
import { getJobsFeedSnapshot } from "./service";

const DEFAULT_PANEL_LIMIT = 8;
const DEFAULT_SEARCH_WINDOW_DAYS = 30;

type CandidateProfileDefaults = {
  careerIdentityId: string | null;
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

export type JobSearchCatalogResult = {
  appliedFilters: JobSearchRetrievalResultDto["appliedFilters"];
  debugMeta: JobSearchRetrievalResultDto["debugMeta"];
  diagnostics: JobSearchRetrievalResultDto["diagnostics"];
  fallbackApplied: JobSearchRetrievalResultDto["fallbackApplied"];
  generatedAt: string;
  profileContext: JobSeekerProfileContextDto | null;
  query: JobSearchQueryDto;
  queryInterpretation: JobSearchRetrievalResultDto["queryInterpretation"];
  rail: {
    cards: JobRailCardDto[];
    emptyState: string | null;
  };
  rankingSummary: JobSearchRetrievalResultDto["rankingSummary"];
  resultQuality: JobSearchRetrievalResultDto["resultQuality"];
  results: JobPostingDto[];
  returnedCount: number;
  totalCandidateCount: number;
};

function isGenericFindJobsPrompt(args: {
  companies: string[];
  location: string | null;
  normalizedPrompt: string;
  role: string | null;
  seniority: string | null;
  workplaceType: JobSearchFiltersDto["workplaceType"];
}) {
  return (
    args.companies.length === 0 &&
    !args.location &&
    !args.role &&
    !args.seniority &&
    !args.workplaceType &&
    (args.normalizedPrompt.includes("for me") ||
      args.normalizedPrompt === "find new jobs" ||
      args.normalizedPrompt === "find new jobs for me")
  );
}

function isFreshnessFirstBrowsePrompt(args: {
  companies: string[];
  location: string | null;
  normalizedPrompt: string;
  role: string | null;
  seniority: string | null;
  workplaceType: JobSearchFiltersDto["workplaceType"];
}) {
  return (
    isGenericFindJobsPrompt(args) &&
    (args.normalizedPrompt.includes("new jobs") ||
      args.normalizedPrompt.includes("latest jobs") ||
      args.normalizedPrompt.includes("recent jobs") ||
      args.normalizedPrompt.includes("recently posted"))
  );
}

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

function extractEmploymentType(prompt: string) {
  const match = prompt.match(
    /\b(full[ -]?time|part[ -]?time|contract|contractor|temporary|temp|internship|intern)\b/i,
  );

  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function extractSalaryBounds(prompt: string) {
  const matches = Array.from(
    prompt.matchAll(/(?:[$£€])?\s*\d[\d,.]*(?:\.\d+)?\s*[kKmM]?/g),
  )
    .map((match) => {
      const raw = match[0]?.trim() ?? "";
      const numeric = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));

      if (!Number.isFinite(numeric)) {
        return null;
      }

      if (/[kK]/.test(raw)) {
        return numeric * 1_000;
      }

      if (/[mM]/.test(raw)) {
        return numeric * 1_000_000;
      }

      return numeric;
    })
    .filter((value): value is number => value !== null);

  return {
    max: matches.length > 1 ? matches[1] : matches[0] ?? null,
    min: matches[0] ?? null,
  };
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
        .filter(
          (token) => !["find", "show", "jobs", "roles", "positions", "openings", "new"].includes(token),
        ),
    ),
  ).slice(0, 12);
}

function createProfileContext(profile: CandidateProfileDefaults | null): JobSeekerProfileContextDto | null {
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

export function parseJobSearchQuery(args: {
  candidateDefaults: CandidateProfileDefaults | null;
  prompt: string;
}): JobSearchQueryDto {
  const prompt = args.prompt.trim();
  const normalizedPrompt = normalizeHumanLabel(prompt);
  const companies = extractCompanies(prompt);
  const location = extractLocation(prompt);
  const role = extractRole(prompt);
  const seniority = extractSeniority(prompt);
  const employmentType = extractEmploymentType(prompt);
  const salaryBounds = extractSalaryBounds(prompt);
  const workplaceType = normalizedPrompt.includes("remote")
    ? "remote"
    : normalizedPrompt.includes("hybrid")
      ? "hybrid"
      : normalizedPrompt.includes("onsite") || normalizedPrompt.includes("on-site")
        ? "onsite"
        : null;
  const isGenericPrompt = isGenericFindJobsPrompt({
    companies,
    location,
    normalizedPrompt,
    role,
    seniority,
    workplaceType,
  });
  const isFreshnessBrowsePrompt = isFreshnessFirstBrowsePrompt({
    companies,
    location,
    normalizedPrompt,
    role,
    seniority,
    workplaceType,
  });
  const postedWithinDays = isFreshnessBrowsePrompt ? null : extractPostedWithinDays(prompt);
  const keywords = isGenericPrompt ? [] : extractKeywords(role, prompt);
  const filters: JobSearchFiltersDto = {
    companies,
    employmentType,
    exclusions: [],
    industries: [],
    keywords,
    location,
    locations: location ? [location] : [],
    postedWithinDays,
    role,
    roleFamilies: role ? [role] : [],
    rankingBoosts: isFreshnessBrowsePrompt
      ? ["freshness", "trusted_source"]
      : ["title_alignment", "freshness", "trusted_source"],
    remotePreference:
      workplaceType === "remote"
        ? "remote_only"
        : workplaceType === "hybrid"
          ? "hybrid_preferred"
          : workplaceType === "onsite"
            ? "onsite_preferred"
            : null,
    salaryMax: salaryBounds.max,
    salaryMin: salaryBounds.min,
    seniority,
    skills: [],
    targetJobId: null,
    workplaceType,
  };

  if (isGenericPrompt && args.candidateDefaults && !isFreshnessBrowsePrompt) {
    return {
      careerIdSignals: args.candidateDefaults.signals,
      conversationContext: null,
      effectivePrompt: prompt,
      filters,
      normalizedPrompt,
      prompt,
      usedCareerIdDefaults: true,
    };
  }

  return {
    careerIdSignals: isFreshnessBrowsePrompt ? [] : args.candidateDefaults?.signals ?? [],
    conversationContext: null,
    effectivePrompt: prompt,
    filters,
    normalizedPrompt,
    prompt,
    usedCareerIdDefaults: false,
  };
}

export async function resolveJobSeekerProfileContext(ownerId: string | null | undefined) {
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
      careerIdentityId: context.aggregate.talentIdentity.id,
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

function buildSearchHaystack(job: JobPostingDto) {
  return [
    job.title,
    job.normalizedTitle,
    job.descriptionSnippet,
    job.department,
    job.companyName,
    job.location,
    job.commitment,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

function jobMatchesAnyLocation(job: JobPostingDto, locations: string[]) {
  if (locations.length === 0) {
    return true;
  }

  return locations.some((location) => jobMatchesLocation(job, location));
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

  const timestamp = getPostedTimestamp(job);

  if (timestamp === null) {
    return false;
  }

  return Date.now() - timestamp <= postedWithinDays * 24 * 60 * 60 * 1000;
}

function getPostedTimestamp(job: Pick<JobPostingDto, "postedAt" | "updatedAt">) {
  const value = job.postedAt || job.updatedAt;

  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}

function jobMatchesEmploymentType(job: JobPostingDto, employmentType: string | null) {
  if (!employmentType) {
    return true;
  }

  return normalizeHumanLabel(job.commitment ?? "").includes(normalizeHumanLabel(employmentType));
}

function jobMatchesIndustries(job: JobPostingDto, industries: string[]) {
  if (industries.length === 0) {
    return true;
  }

  const haystack = buildSearchHaystack(job);

  return industries.some((industry) => haystack.includes(normalizeHumanLabel(industry)));
}

function countSkillOverlap(job: JobPostingDto, skills: string[]) {
  if (skills.length === 0) {
    return 0;
  }

  const haystack = buildSearchHaystack(job);

  return skills.reduce((count, skill) => {
    if (haystack.includes(normalizeHumanLabel(skill))) {
      return count + 1;
    }

    return count;
  }, 0);
}

function jobMatchesExclusions(job: JobPostingDto, exclusions: string[]) {
  if (exclusions.length === 0) {
    return true;
  }

  const haystack = buildSearchHaystack(job);

  return exclusions.every((exclusion) => !haystack.includes(normalizeHumanLabel(exclusion)));
}

function jobMatchesRole(job: JobPostingDto, filters: JobSearchFiltersDto) {
  if (
    !filters.role &&
    filters.keywords.length === 0 &&
    !filters.seniority &&
    filters.skills.length === 0 &&
    filters.roleFamilies.length === 0
  ) {
    return true;
  }

  const haystack = buildSearchHaystack(job);
  const roleMatch = filters.role ? haystack.includes(normalizeHumanLabel(filters.role)) : false;
  const seniorityMatch = filters.seniority ? haystack.includes(normalizeHumanLabel(filters.seniority)) : false;
  const roleFamilyMatch =
    filters.roleFamilies.length === 0 ||
    filters.roleFamilies.some((roleFamily) => haystack.includes(normalizeHumanLabel(roleFamily)));
  const keywordMatch =
    filters.keywords.length === 0 ||
    filters.keywords.some((keyword) => haystack.includes(normalizeHumanLabel(keyword)));
  const skillMatch = filters.skills.length === 0 || countSkillOverlap(job, filters.skills) > 0;

  return roleMatch || seniorityMatch || roleFamilyMatch || keywordMatch || skillMatch;
}

function buildFriendlyMatchSignals(args: {
  candidateDefaults: CandidateProfileDefaults | null;
  filters: JobSearchFiltersDto;
  job: JobPostingDto;
  validation: ValidationSnapshot;
}) {
  const signals: string[] = [];

  if (args.filters.role && normalizeHumanLabel(args.job.title).includes(normalizeHumanLabel(args.filters.role))) {
    signals.push(`title aligned with ${args.filters.role}`);
  }

  if (args.filters.seniority && normalizeHumanLabel(args.job.title).includes(normalizeHumanLabel(args.filters.seniority))) {
    signals.push(`${args.filters.seniority} seniority alignment`);
  }

  if (args.filters.location && jobMatchesLocation(args.job, args.filters.location)) {
    signals.push(`location aligned with ${args.filters.location}`);
  }

  if (args.filters.workplaceType && jobMatchesWorkplace(args.job, args.filters.workplaceType)) {
    signals.push(`${args.filters.workplaceType} workplace match`);
  }

  if (args.filters.skills.length > 0) {
    const overlap = countSkillOverlap(args.job, args.filters.skills);

    if (overlap > 0) {
      signals.push(`${overlap} requested skill${overlap === 1 ? "" : "s"} matched`);
    }
  }

  if (args.filters.companies.length > 0 && jobMatchesCompanies(args.job, args.filters.companies)) {
    signals.push(`company aligned with ${args.job.companyName}`);
  }

  if (args.filters.industries.length > 0 && jobMatchesIndustries(args.job, args.filters.industries)) {
    signals.push("industry-aligned context");
  }

  if (
    args.candidateDefaults?.targetRole &&
    normalizeHumanLabel(args.job.title).includes(normalizeHumanLabel(args.candidateDefaults.targetRole))
  ) {
    signals.push("aligned with your Career ID target role");
  }

  if (args.candidateDefaults?.location && jobMatchesLocation(args.job, args.candidateDefaults.location)) {
    signals.push("aligned with your Career ID location");
  }

  if (args.validation.validationStatus === "active_verified") {
    signals.push("validated from a trusted source");
  }

  if (jobMatchesRecency(args.job, 7)) {
    signals.push("fresh posting");
  }

  return signals;
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

  if (
    (args.filters.location && jobMatchesLocation(args.job, args.filters.location)) ||
    (args.filters.locations.length > 0 && jobMatchesAnyLocation(args.job, args.filters.locations))
  ) {
    reasons.push("location_match");
  }

  if (args.filters.workplaceType && jobMatchesWorkplace(args.job, args.filters.workplaceType)) {
    reasons.push("workplace_match");
  }

  if (countSkillOverlap(args.job, args.filters.skills) > 0) {
    reasons.push("skill_overlap");
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

  if (
    (args.filters.location && jobMatchesLocation(args.job, args.filters.location)) ||
    (args.filters.locations.length > 0 && jobMatchesAnyLocation(args.job, args.filters.locations))
  ) {
    score += 14;
  }

  if (args.filters.workplaceType && jobMatchesWorkplace(args.job, args.filters.workplaceType)) {
    score += 10;
  }

  if (args.filters.keywords.length > 0 && jobMatchesRole(args.job, args.filters)) {
    score += 12;
  }

  const skillOverlap = countSkillOverlap(args.job, args.filters.skills);

  if (skillOverlap > 0) {
    score += Math.min(skillOverlap * 5, 15);
  }

  if (args.filters.industries.length > 0 && jobMatchesIndustries(args.job, args.filters.industries)) {
    score += 8;
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

  if (args.filters.rankingBoosts.includes("profile_alignment") && args.candidateDefaults?.signals.length) {
    score += 5;
  }

  return score;
}

function buildMatchSummary(job: JobPostingDto) {
  if (job.matchSummary) {
    return job.matchSummary;
  }

  if (job.matchSignals && job.matchSignals.length > 0) {
    return job.matchSignals.slice(0, 2).join(", ");
  }

  return "Grounded match from the live jobs inventory.";
}

function mergeValidationIntoJob(args: {
  candidateDefaults: CandidateProfileDefaults | null;
  filters: JobSearchFiltersDto;
  job: JobPostingDto;
  reasons: string[];
  validation: ValidationSnapshot;
}) {
  const matchSignals = buildFriendlyMatchSignals({
    candidateDefaults: args.candidateDefaults,
    filters: args.filters,
    job: args.job,
    validation: args.validation,
  });

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
    matchSignals,
    matchSummary:
      matchSignals.length > 0
        ? matchSignals.slice(0, 2).join(", ")
        : "Grounded match from the live jobs inventory.",
    orchestrationReadiness: args.validation.orchestrationReadiness,
    redirectRequired: args.validation.redirectRequired,
    searchReasons: args.reasons,
    sourceTrustTier: args.validation.sourceTrustTier,
    trustScore: args.validation.trustScore,
    validationStatus: args.validation.validationStatus,
    workplaceType: args.job.workplaceType ?? inferJobWorkplaceType(args.job.location),
  } satisfies JobPostingDto;
}

function createRelevanceScore(rawScore: number, topScore: number) {
  if (topScore <= 0) {
    return 0;
  }

  return Number(Math.max(0, Math.min(1, rawScore / topScore)).toFixed(3));
}

export function buildJobRailCards(jobs: JobPostingDto[]) {
  return jobs.map((job) => ({
    applyUrl: job.canonicalApplyUrl ?? job.applyUrl,
    company: job.companyName,
    jobId: job.id,
    location: job.location,
    matchReason: formatJobMatchReason({
      matchReason: job.matchSignals?.[0] ?? buildMatchSummary(job),
      matchReasons: job.matchReasons,
      matchSummary: job.matchSummary,
    }),
    relevanceScore: job.relevanceScore ?? null,
    salaryText: job.salaryText ?? null,
    summary: job.descriptionSnippet ?? null,
    title: job.title,
    workplaceType: job.workplaceType ?? null,
  })) satisfies JobRailCardDto[];
}

export async function searchJobsCatalog(args: {
  conversationId?: string | null;
  limit?: number;
  offset?: number;
  origin?: JobSearchOrigin;
  ownerId?: string | null;
  profileContext?: JobSeekerProfileContextDto | null;
  prompt?: string;
  query?: JobSearchQueryDto;
  refresh?: boolean;
}): Promise<JobSearchCatalogResult> {
  const candidateDefaults = args.profileContext
    ? {
        careerIdentityId: args.profileContext.careerIdentityId,
        headline: args.profileContext.headline,
        location: args.profileContext.location,
        signals: args.profileContext.signals,
        targetRole: args.profileContext.targetRole,
      }
    : await resolveJobSeekerProfileContext(args.ownerId);
  const profileContext = args.profileContext ?? createProfileContext(candidateDefaults);
  const query =
    args.query ??
    parseJobSearchQuery({
      candidateDefaults,
      prompt: args.prompt ?? "",
    });
  const snapshot = await getSearchableJobSnapshot({
    refresh: args.refresh ?? false,
    windowDays: query.filters.postedWithinDays,
  });
  const generatedAt = new Date().toISOString();
  const searchResult = runHybridJobSearch({
    jobs: snapshot.jobs,
    limit: Math.max(1, Math.min(args.limit ?? DEFAULT_PANEL_LIMIT, 12)),
    offset: Math.max(0, args.offset ?? 0),
    profileContext,
    query,
    sourceCount: snapshot.sourceCount,
  });
  const railCards = buildRetrievalRailCards(searchResult.results);

  if (isDatabaseConfigured() && args.ownerId) {
    await Promise.all([
      recordJobSearchEvent({
        conversationId: args.conversationId ?? null,
        latencyMs: searchResult.diagnostics.searchLatencyMs,
        origin: args.origin ?? "api",
        ownerId: args.ownerId,
        prompt: searchResult.resolvedQuery.effectivePrompt ?? searchResult.resolvedQuery.prompt,
        query: searchResult.resolvedQuery,
        resultCount: searchResult.totalCandidateCount,
        resultJobIds: searchResult.results.map((job) => job.id),
      }),
      recordJobValidationEvents({
        events: searchResult.results.map((job) => ({
          jobId: job.id,
          reasonCodes: job.searchReasons ?? [],
          sourceTrustTier: job.sourceTrustTier ?? "unknown",
          trustScore: job.trustScore ?? 0,
          validationStatus: job.validationStatus ?? "active_unverified",
        })),
        observedAt: generatedAt,
      }),
    ]);
  }

  return jobSearchRetrievalResultSchema.parse({
    appliedFilters: searchResult.appliedFilters,
    debugMeta: {
      ...searchResult.debugMeta,
      fallbackApplied: searchResult.fallbackApplied,
    },
    diagnostics: searchResult.diagnostics,
    fallbackApplied: searchResult.fallbackApplied,
    generatedAt,
    profileContext,
    query: searchResult.resolvedQuery,
    queryInterpretation: searchResult.queryInterpretation,
    rail: {
      cards: railCards,
      emptyState: buildRetrievalEmptyState(searchResult.results),
    },
    rankingSummary: searchResult.rankingSummary,
    resultQuality: searchResult.resultQuality,
    results: searchResult.results,
    returnedCount: searchResult.results.length,
    totalCandidateCount: searchResult.totalCandidateCount,
  });
}

export async function findSimilarJobsCatalog(args: {
  jobId: string;
  limit?: number;
  ownerId?: string | null;
  refresh?: boolean;
}) {
  const anchorJob = await getJobPostingDetails({
    jobId: args.jobId,
  });

  if (!anchorJob) {
    return null;
  }

  const query: JobSearchQueryDto = {
    careerIdSignals: [],
    conversationContext: `Find jobs similar to ${anchorJob.title} at ${anchorJob.companyName}.`,
    effectivePrompt: `Find jobs similar to ${anchorJob.title}.`,
    filters: {
      companies: [],
      employmentType: anchorJob.commitment ?? null,
      exclusions: [anchorJob.companyName],
      industries: [],
      keywords: extractKeywords(anchorJob.title, anchorJob.descriptionSnippet ?? anchorJob.title),
      location: anchorJob.location,
      locations: anchorJob.location ? [anchorJob.location] : [],
      postedWithinDays: null,
      role: anchorJob.title,
      roleFamilies: [anchorJob.title],
      rankingBoosts: ["title_alignment", "location_alignment", "trusted_source"],
      remotePreference:
        (anchorJob.workplaceType ?? inferJobWorkplaceType(anchorJob.location)) === "remote"
          ? "remote_preferred"
          : (anchorJob.workplaceType ?? inferJobWorkplaceType(anchorJob.location)) === "hybrid"
            ? "hybrid_preferred"
            : null,
      salaryMax: anchorJob.salaryRange?.max ?? null,
      salaryMin: anchorJob.salaryRange?.min ?? null,
      seniority: null,
      skills: [],
      targetJobId: anchorJob.id,
      workplaceType: anchorJob.workplaceType ?? inferJobWorkplaceType(anchorJob.location),
    },
    normalizedPrompt: normalizeHumanLabel(`Find jobs similar to ${anchorJob.title}`),
    prompt: `Find jobs similar to ${anchorJob.title}`,
    usedCareerIdDefaults: false,
  };

  return searchJobsCatalog({
    limit: args.limit,
    ownerId: args.ownerId,
    query,
    refresh: args.refresh,
  });
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
      candidateDefaults: null,
      filters: {
        companies: [],
        employmentType: null,
        exclusions: [],
        industries: [],
        keywords: [],
        location: null,
        locations: [],
        postedWithinDays: null,
        role: null,
        roleFamilies: [],
        rankingBoosts: [],
        remotePreference: null,
        salaryMax: null,
        salaryMin: null,
        seniority: null,
        skills: [],
        targetJobId: null,
        workplaceType: null,
      },
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
        sourceTrustTier: job.sourceTrustTier ?? "unknown",
        trustScore: job.trustScore ?? 0,
        validationStatus: job.validationStatus ?? "active_unverified",
      })),
    });
  }

  return results;
}
