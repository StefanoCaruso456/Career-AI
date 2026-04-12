import type {
  JobPostingDto,
  JobSearchFallbackDto,
  JobSearchFiltersDto,
  JobSearchQueryDto,
  JobSearchQueryInterpretationDto,
  JobSearchRankingBreakdownDto,
  JobSearchRankingBoost,
  JobSearchRankingSummaryDto,
  JobSalaryRangeDto,
  JobSeekerProfileContextDto,
  JobSeekerResultQuality,
} from "@/packages/contracts/src";
import {
  createJobDedupeFingerprint,
  evaluateJobValidation,
  inferJobWorkplaceType,
  normalizeHumanLabel,
} from "./metadata";
import { formatJobMatchReason } from "@/lib/jobs/format-job-match-reason";

const DEFAULT_SEARCH_WINDOW_DAYS = 30;
const SEARCH_SCORING_VERSION = "hybrid_v1";
const BASELINE_LIMIT_MULTIPLIER = 8;
const SEARCH_STOPWORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "around",
  "at",
  "based",
  "by",
  "for",
  "find",
  "from",
  "get",
  "help",
  "hiring",
  "in",
  "include",
  "jobs",
  "latest",
  "looking",
  "me",
  "near",
  "new",
  "of",
  "on",
  "open",
  "openings",
  "or",
  "position",
  "positions",
  "preferably",
  "recent",
  "recently",
  "remote",
  "role",
  "roles",
  "search",
  "show",
  "hybrid",
  "onsite",
  "on",
  "site",
  "full",
  "time",
  "part",
  "contract",
  "contractor",
  "internship",
  "intern",
  "junior",
  "senior",
  "staff",
  "principal",
  "lead",
  "director",
  "head",
  "vp",
  "surface",
  "the",
  "to",
  "what",
  "with",
]);

const ROLE_FAMILY_CONFIG = [
  {
    adjacent: ["product operations", "product strategy", "program manager"],
    aliases: [
      "product",
      "product manager",
      "product management",
      "ai product manager",
      "technical product manager",
      "associate product manager",
      "group product manager",
      "product owner",
      "product lead",
      "pm",
    ],
    family: "product manager",
    themes: ["product", "roadmap", "strategy", "go to market"],
  },
  {
    adjacent: ["ai engineer", "data scientist", "research engineer"],
    aliases: [
      "machine learning engineer",
      "ml engineer",
      "machine learning",
      "applied scientist",
      "ml researcher",
    ],
    family: "machine learning engineer",
    themes: ["machine learning", "ml", "models", "artificial intelligence"],
  },
  {
    adjacent: ["machine learning engineer", "software engineer", "platform engineer"],
    aliases: ["ai engineer", "artificial intelligence engineer", "genai engineer", "llm engineer"],
    family: "ai engineer",
    themes: ["ai", "genai", "llm", "artificial intelligence"],
  },
  {
    adjacent: ["business analyst", "analytics engineer", "data scientist"],
    aliases: ["data analyst", "analytics analyst", "business intelligence analyst", "bi analyst"],
    family: "data analyst",
    themes: ["analytics", "reporting", "sql", "data"],
  },
  {
    adjacent: ["machine learning engineer", "analytics engineer", "data analyst"],
    aliases: ["data scientist", "applied scientist", "research scientist"],
    family: "data scientist",
    themes: ["experimentation", "statistics", "modeling", "data science"],
  },
  {
    adjacent: ["backend engineer", "frontend engineer", "full stack engineer", "platform engineer"],
    aliases: [
      "software engineer",
      "software developer",
      "application engineer",
      "developer",
      "engineer",
    ],
    family: "software engineer",
    themes: ["software", "backend", "frontend", "coding"],
  },
  {
    adjacent: ["software engineer", "platform engineer", "site reliability engineer"],
    aliases: ["backend engineer", "backend developer", "api engineer"],
    family: "backend engineer",
    themes: ["backend", "apis", "distributed systems", "services"],
  },
  {
    adjacent: ["software engineer", "backend engineer", "site reliability engineer"],
    aliases: ["platform engineer", "devops engineer", "infrastructure engineer", "sre"],
    family: "platform engineer",
    themes: ["platform", "devops", "infrastructure", "cloud"],
  },
  {
    adjacent: ["ux designer", "visual designer", "design lead"],
    aliases: ["product designer", "ux designer", "ui designer"],
    family: "product designer",
    themes: ["design", "ux", "ui", "research"],
  },
  {
    adjacent: ["customer success", "account manager", "solutions consultant"],
    aliases: ["account executive", "sales executive", "enterprise account executive", "sales"],
    family: "account executive",
    themes: ["sales", "revenue", "pipeline", "customers"],
  },
  {
    adjacent: ["customer success", "technical account manager", "solutions architect"],
    aliases: ["solutions engineer", "sales engineer", "solutions consultant"],
    family: "solutions engineer",
    themes: ["pre sales", "solutions", "customers", "technical"],
  },
  {
    adjacent: ["people operations", "hr business partner"],
    aliases: ["recruiter", "talent acquisition", "technical recruiter", "sourcer"],
    family: "recruiter",
    themes: ["recruiting", "hiring", "sourcing", "candidates"],
  },
  {
    adjacent: ["product manager", "account executive", "strategy manager"],
    aliases: ["business analyst", "strategy analyst", "operations analyst"],
    family: "business analyst",
    themes: ["analysis", "operations", "strategy", "reporting"],
  },
  {
    adjacent: ["compliance", "risk", "platform engineer"],
    aliases: ["security engineer", "cybersecurity engineer", "security analyst"],
    family: "security engineer",
    themes: ["security", "cybersecurity", "risk", "incident"],
  },
] as const;

const INDUSTRY_KEYWORDS = {
  ai: ["ai", "artificial intelligence", "genai", "llm", "machine learning"],
  analytics: ["analytics", "business intelligence", "bi", "reporting"],
  cybersecurity: ["cybersecurity", "security", "identity", "threat", "risk"],
  education: ["education", "edtech", "learning", "student"],
  fintech: ["fintech", "payments", "banking", "financial"],
  healthcare: ["healthcare", "health care", "health tech", "medical", "clinical", "hospital"],
  saas: ["saas", "software as a service", "b2b", "enterprise"],
  startup: ["startup", "high growth", "scale up", "venture backed"],
} as const;

function isFreshnessFirstBrowseInterpretation(interpretation: JobSearchQueryInterpretationDto) {
  return (
    interpretation.normalizedRoles.length === 0 &&
    interpretation.skills.length === 0 &&
    interpretation.locations.length === 0 &&
    interpretation.companyTerms.length === 0 &&
    interpretation.industries.length === 0 &&
    !interpretation.remotePreference &&
    !interpretation.seniority &&
    !interpretation.employmentType &&
    /(?:\bnew jobs?\b|\blatest jobs?\b|\brecent jobs?\b|\brecently posted\b)/i.test(
      interpretation.normalizedQuery,
    )
  );
}

function isDeterministicLatestBrowseQuery(query: JobSearchQueryDto) {
  return (
    !query.usedCareerIdDefaults &&
    query.filters.companies.length === 0 &&
    query.filters.employmentType === null &&
    query.filters.exclusions.length === 0 &&
    query.filters.industries.length === 0 &&
    query.filters.keywords.length === 0 &&
    query.filters.location === null &&
    query.filters.locations.length === 0 &&
    query.filters.postedWithinDays === null &&
    query.filters.role === null &&
    query.filters.roleFamilies.length === 0 &&
    query.filters.remotePreference === null &&
    query.filters.salaryMax === null &&
    query.filters.salaryMin === null &&
    query.filters.seniority === null &&
    query.filters.skills.length === 0 &&
    query.filters.targetJobId === null &&
    query.filters.workplaceType === null &&
    query.filters.rankingBoosts.includes("freshness")
  );
}

type SearchJobDocument = {
  dedupeFingerprint: string;
  fullText: string;
  fullTokens: string[];
  job: JobPostingDto;
  locationText: string;
  parsedSalaryRange: JobSalaryRangeDto;
  semanticVector: Map<string, number>;
  titleText: string;
  titleTokens: string[];
  validation: ReturnType<typeof evaluateJobValidation>;
  workplaceType: JobPostingDto["workplaceType"];
};

type SearchRankedCandidate = {
  breakdown: JobSearchRankingBreakdownDto;
  job: JobPostingDto;
  matchReasons: string[];
};

type SearchPassResult = {
  appliedFilters: JobSearchFiltersDto & {
    limit: number;
    offset: number;
  };
  debugMeta: {
    candidateCountAfterFiltering: number;
    candidateCountAfterMerging: number;
    duplicateCount: number;
    filteredOutCount: number;
    invalidCount: number;
    lexicalCandidateCount: number;
    mergedCandidateCount: number;
    searchLatencyMs: number;
    semanticCandidateCount: number;
    sourceCount: number;
    staleCount: number;
    structuredCandidateCount: number;
  };
  diagnostics: {
    duplicateCount: number;
    filteredOutCount: number;
    invalidCount: number;
    searchLatencyMs: number;
    sourceCount: number;
    staleCount: number;
  };
  queryInterpretation: JobSearchQueryInterpretationDto;
  rankingSummary: JobSearchRankingSummaryDto;
  resultQuality: JobSeekerResultQuality;
  resolvedQuery: JobSearchQueryDto;
  results: JobPostingDto[];
  totalCandidateCount: number;
};

type RoleFamilyConfig = (typeof ROLE_FAMILY_CONFIG)[number];

function uniq(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.replace(/\s+/g, " ").trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(Math.max(value, minimum), maximum);
}

function tokenize(value: string) {
  return normalizeHumanLabel(value)
    .split(/[^a-z0-9+#./-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !SEARCH_STOPWORDS.has(token));
}

function overlapScore(queryTerms: string[], candidateTerms: string[]) {
  if (queryTerms.length === 0 || candidateTerms.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidateTerms);
  const matches = queryTerms.filter((term) => candidateSet.has(term));

  return matches.length / queryTerms.length;
}

function phraseMatchScore(queryPhrases: string[], haystack: string) {
  if (queryPhrases.length === 0 || !haystack) {
    return 0;
  }

  const normalizedHaystack = normalizeHumanLabel(haystack);
  const hits = queryPhrases.filter((phrase) => normalizedHaystack.includes(normalizeHumanLabel(phrase)));

  return hits.length / queryPhrases.length;
}

function parseCompactNumber(value: string) {
  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const numeric = Number.parseFloat(normalized.replace(/[^0-9.]/g, ""));

  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (normalized.includes("k")) {
    return numeric * 1_000;
  }

  if (normalized.includes("m")) {
    return numeric * 1_000_000;
  }

  return numeric;
}

function parseSalaryRange(rawText: string | null | undefined): JobSalaryRangeDto {
  const text = rawText?.trim() ?? null;

  if (!text) {
    return {
      currency: null,
      max: null,
      min: null,
      rawText: null,
    };
  }

  const currencyMatch = text.match(/[$£€]/);
  const numberMatches = Array.from(text.matchAll(/(?:[$£€])?\s*\d[\d,.]*(?:\.\d+)?\s*[kKmM]?/g))
    .map((match) => parseCompactNumber(match[0] ?? ""))
    .filter((value): value is number => value !== null);
  const min = numberMatches[0] ?? null;
  const max = numberMatches.length > 1 ? numberMatches[1] : min;

  return {
    currency: currencyMatch?.[0] ?? null,
    max,
    min,
    rawText: text,
  };
}

function collectPayloadStrings(value: unknown, depth = 0, strings: string[] = []) {
  if (strings.length >= 40 || depth > 4 || value === null || value === undefined) {
    return strings;
  }

  if (typeof value === "string") {
    const trimmed = value.replace(/\s+/g, " ").trim();

    if (trimmed.length > 0) {
      strings.push(trimmed);
    }

    return strings;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPayloadStrings(item, depth + 1, strings);
      if (strings.length >= 40) {
        break;
      }
    }

    return strings;
  }

  if (typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectPayloadStrings(entry, depth + 1, strings);
      if (strings.length >= 40) {
        break;
      }
    }
  }

  return strings;
}

function buildRoleFamiliesFromText(text: string) {
  const normalized = normalizeHumanLabel(text);
  const matched = ROLE_FAMILY_CONFIG.filter((role) =>
    role.aliases.some((alias) => normalized.includes(normalizeHumanLabel(alias))),
  );

  return {
    adjacentRoles: uniq(matched.flatMap((role) => role.adjacent)),
    families: uniq(matched.map((role) => role.family)),
    themes: uniq(matched.flatMap((role) => role.themes)),
  };
}

function buildIndustryTags(text: string) {
  const normalized = normalizeHumanLabel(text);

  return uniq(
    Object.entries(INDUSTRY_KEYWORDS).flatMap(([industry, keywords]) =>
      keywords.some((keyword) => normalized.includes(normalizeHumanLabel(keyword))) ? [industry] : [],
    ),
  );
}

function buildWeightedVector(args: {
  company: string;
  department: string | null;
  fullText: string;
  title: string;
}) {
  const vector = new Map<string, number>();
  const increment = (term: string, weight: number) => {
    if (!term) {
      return;
    }

    vector.set(term, (vector.get(term) ?? 0) + weight);
  };
  const addTokens = (value: string, weight: number) => {
    for (const token of tokenize(value)) {
      increment(token, weight);
    }
  };

  addTokens(args.title, 3);
  addTokens(args.company, 1.25);
  addTokens(args.department ?? "", 1.1);
  addTokens(args.fullText, 1);

  const roleFamilies = buildRoleFamiliesFromText(args.title);

  for (const family of roleFamilies.families) {
    increment(family, 2.6);
  }

  for (const adjacentRole of roleFamilies.adjacentRoles) {
    increment(adjacentRole, 1.2);
  }

  for (const theme of roleFamilies.themes) {
    increment(theme, 1.1);
  }

  for (const industry of buildIndustryTags(args.fullText)) {
    increment(industry, 1.4);
  }

  return vector;
}

function cosineSimilarity(queryVector: Map<string, number>, documentVector: Map<string, number>) {
  if (queryVector.size === 0 || documentVector.size === 0) {
    return 0;
  }

  let dot = 0;
  let queryMagnitude = 0;
  let documentMagnitude = 0;

  for (const value of queryVector.values()) {
    queryMagnitude += value * value;
  }

  for (const value of documentVector.values()) {
    documentMagnitude += value * value;
  }

  for (const [term, queryWeight] of queryVector.entries()) {
    const documentWeight = documentVector.get(term);

    if (documentWeight) {
      dot += queryWeight * documentWeight;
    }
  }

  if (queryMagnitude === 0 || documentMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(queryMagnitude) * Math.sqrt(documentMagnitude));
}

function parseSeniority(text: string) {
  const match = text.match(
    /\b(entry|junior|associate|mid|senior|staff|principal|lead|director|head|vp|vice president)\b/i,
  );

  return match?.[1]?.trim().toLowerCase() ?? null;
}

function parseEmploymentType(text: string) {
  const match = text.match(
    /\b(full[ -]?time|part[ -]?time|contract|contractor|temporary|temp|internship|intern)\b/i,
  );

  return match?.[1]?.replace(/\s+/g, " ").trim().toLowerCase() ?? null;
}

function parseRemotePreference(text: string, filters: JobSearchFiltersDto) {
  if (filters.remotePreference) {
    return filters.remotePreference;
  }

  const normalized = normalizeHumanLabel(text);

  if (/\bremote only\b/.test(normalized)) {
    return "remote_only" as const;
  }

  if (/\bremote\b/.test(normalized)) {
    return "remote_preferred" as const;
  }

  if (/\bhybrid\b/.test(normalized)) {
    return "hybrid_preferred" as const;
  }

  if (/\bonsite\b/.test(normalized) || /\bon-site\b/.test(normalized)) {
    return "onsite_preferred" as const;
  }

  if (/\bflexible\b/.test(normalized)) {
    return "flexible" as const;
  }

  return null;
}

function parseWorkplaceType(text: string, filters: JobSearchFiltersDto) {
  if (filters.workplaceType) {
    return filters.workplaceType;
  }

  const normalized = normalizeHumanLabel(text);

  if (/\bremote\b/.test(normalized)) {
    return "remote" as const;
  }

  if (/\bhybrid\b/.test(normalized)) {
    return "hybrid" as const;
  }

  if (/\bonsite\b/.test(normalized) || /\bon-site\b/.test(normalized)) {
    return "onsite" as const;
  }

  return null;
}

function parseSalaryBounds(text: string) {
  const salary = parseSalaryRange(text);

  return {
    max: salary.max,
    min: salary.min,
  };
}

function parseExcludeTerms(text: string) {
  const match = text.match(/\b(?:without|exclude|excluding|except|not)\s+([a-z0-9&.,' /+-]+?)(?=$|[.?!]|,)/i);

  if (!match?.[1]) {
    return [];
  }

  return uniq(
    match[1]
      .replace(/\band\b/gi, ",")
      .split(",")
      .map((segment) => segment.trim()),
  ).slice(0, 6);
}

function filterPromptTokens(args: {
  companies: string[];
  excludeTerms: string[];
  locations: string[];
  prompt: string;
  roleSeeds: string[];
}) {
  const reservedTokens = new Set(
    uniq([
      ...args.companies,
      ...args.excludeTerms,
      ...args.locations,
      ...args.roleSeeds,
    ]).flatMap((value) => tokenize(value)),
  );

  return tokenize(args.prompt).filter((token) => !reservedTokens.has(token));
}

function buildQueryInterpretation(args: {
  profileContext: JobSeekerProfileContextDto | null;
  query: JobSearchQueryDto;
  rawQuery: string;
}) {
  const rawQuery = args.rawQuery.trim();
  const normalizedQuery = normalizeHumanLabel(rawQuery);

  if (isDeterministicLatestBrowseQuery(args.query)) {
    return {
      adjacentRoles: [],
      companyTerms: [],
      employmentType: null,
      excludeTerms: [],
      industries: [],
      locations: [],
      normalizedQuery,
      normalizedRoles: [],
      profileSignalsUsed: [],
      rankingBoosts: uniq([
        ...args.query.filters.rankingBoosts,
        "trusted_source",
      ]) as JobSearchRankingBoost[],
      rawQuery,
      remotePreference: null,
      salaryMax: null,
      salaryMin: null,
      semanticThemes: [],
      seniority: null,
      skills: [],
      workplaceType: null,
    } satisfies JobSearchQueryInterpretationDto;
  }

  const companies = uniq([...args.query.filters.companies]);
  const locations = uniq([...args.query.filters.locations, args.query.filters.location]);
  const roleSeeds = uniq([
    args.query.filters.role,
    ...args.query.filters.roleFamilies,
  ]);
  const matchedFamilies = buildRoleFamiliesFromText(`${rawQuery} ${roleSeeds.join(" ")}`);
  const normalizedRoles = uniq([...roleSeeds, ...matchedFamilies.families]);
  const adjacentRoles = uniq([
    ...matchedFamilies.adjacentRoles,
    ...normalizedRoles.flatMap((role) => {
      const matchedRole = ROLE_FAMILY_CONFIG.find((family) =>
        family.aliases.some((alias) => normalizeHumanLabel(alias) === normalizeHumanLabel(role)),
      );

      return matchedRole?.adjacent ?? [];
    }),
  ]);
  const industries = uniq([
    ...args.query.filters.industries,
    ...buildIndustryTags(rawQuery),
  ]);
  const excludeTerms = uniq([
    ...args.query.filters.exclusions,
    ...parseExcludeTerms(rawQuery),
  ]);
  const filteredPromptTokens = filterPromptTokens({
    companies,
    excludeTerms,
    locations,
    prompt: rawQuery,
    roleSeeds: normalizedRoles,
  });
  const skills = uniq([
    ...args.query.filters.skills,
    ...filteredPromptTokens.filter((token) => token.length >= 3),
  ]).slice(0, 12);
  const remotePreference = parseRemotePreference(rawQuery, args.query.filters);
  const workplaceType = parseWorkplaceType(rawQuery, args.query.filters);
  const salaryBounds = parseSalaryBounds(rawQuery);
  const profileSignalsUsed =
    args.query.usedCareerIdDefaults && args.profileContext
      ? uniq([
          args.profileContext.targetRole,
          args.profileContext.headline,
          args.profileContext.location,
          ...args.profileContext.signals,
        ]).slice(0, 8)
      : [];

  return {
    adjacentRoles,
    companyTerms: companies,
    employmentType: args.query.filters.employmentType ?? parseEmploymentType(rawQuery),
    excludeTerms,
    industries,
    locations,
    normalizedQuery,
    normalizedRoles,
    profileSignalsUsed,
    rankingBoosts: uniq([
      ...args.query.filters.rankingBoosts,
      args.profileContext ? "profile_alignment" : null,
      normalizedRoles.length > 0 ? "title_alignment" : null,
      locations.length > 0 ? "location_alignment" : null,
      skills.length > 0 ? "skill_alignment" : null,
      industries.length > 0 ? "industry_alignment" : null,
      "trusted_source",
    ]) as JobSearchRankingBoost[],
    rawQuery,
    remotePreference,
    salaryMax: args.query.filters.salaryMax ?? salaryBounds.max,
    salaryMin: args.query.filters.salaryMin ?? salaryBounds.min,
    semanticThemes: uniq([
      ...normalizedRoles,
      ...adjacentRoles,
      ...skills,
      ...industries,
      ...profileSignalsUsed,
      ...matchedFamilies.themes,
    ]).slice(0, 18),
    seniority: args.query.filters.seniority ?? parseSeniority(rawQuery),
    skills,
    workplaceType,
  } satisfies JobSearchQueryInterpretationDto;
}

function createAppliedFilters(args: {
  limit: number;
  offset: number;
  query: JobSearchQueryDto;
  queryInterpretation: JobSearchQueryInterpretationDto;
}) {
  return {
    ...args.query.filters,
    companies:
      args.query.filters.companies.length > 0
        ? args.query.filters.companies
        : args.queryInterpretation.companyTerms,
    employmentType: args.query.filters.employmentType ?? args.queryInterpretation.employmentType,
    exclusions:
      args.query.filters.exclusions.length > 0
        ? args.query.filters.exclusions
        : args.queryInterpretation.excludeTerms,
    industries:
      args.query.filters.industries.length > 0
        ? args.query.filters.industries
        : args.queryInterpretation.industries,
    limit: args.limit,
    location: args.query.filters.location ?? args.queryInterpretation.locations[0] ?? null,
    locations:
      args.query.filters.locations.length > 0
        ? args.query.filters.locations
        : args.queryInterpretation.locations,
    offset: args.offset,
    rankingBoosts: args.queryInterpretation.rankingBoosts,
    remotePreference: args.query.filters.remotePreference ?? args.queryInterpretation.remotePreference,
    role:
      args.query.filters.role ??
      args.queryInterpretation.normalizedRoles[0] ??
      null,
    roleFamilies:
      args.query.filters.roleFamilies.length > 0
        ? args.query.filters.roleFamilies
        : args.queryInterpretation.normalizedRoles,
    salaryMax: args.query.filters.salaryMax ?? args.queryInterpretation.salaryMax,
    salaryMin: args.query.filters.salaryMin ?? args.queryInterpretation.salaryMin,
    seniority: args.query.filters.seniority ?? args.queryInterpretation.seniority,
    skills:
      args.query.filters.skills.length > 0
        ? args.query.filters.skills
        : args.queryInterpretation.skills,
    workplaceType: args.query.filters.workplaceType ?? args.queryInterpretation.workplaceType,
  } satisfies SearchPassResult["appliedFilters"];
}

function buildQueryVector(interpretation: JobSearchQueryInterpretationDto) {
  const vector = new Map<string, number>();
  const increment = (term: string, weight: number) => {
    const normalized = normalizeHumanLabel(term);

    if (!normalized) {
      return;
    }

    vector.set(normalized, (vector.get(normalized) ?? 0) + weight);
  };

  for (const role of interpretation.normalizedRoles) {
    increment(role, 3.2);
  }

  for (const role of interpretation.adjacentRoles) {
    increment(role, 1.8);
  }

  for (const skill of interpretation.skills) {
    increment(skill, 1.9);
  }

  for (const industry of interpretation.industries) {
    increment(industry, 1.6);
  }

  for (const profileSignal of interpretation.profileSignalsUsed) {
    increment(profileSignal, 1.35);
  }

  for (const theme of interpretation.semanticThemes) {
    increment(theme, 1.1);
  }

  for (const token of tokenize(interpretation.rawQuery)) {
    increment(token, 0.7);
  }

  return vector;
}

function buildSearchDocument(job: JobPostingDto) {
  const rawPayloadText = collectPayloadStrings(job.rawPayload).join(" ");
  const workplaceType = job.workplaceType ?? inferJobWorkplaceType(job.location);
  const fullText = [
    job.title,
    job.normalizedTitle,
    job.companyName,
    job.location,
    job.department,
    job.commitment,
    job.descriptionSnippet,
    job.salaryText,
    rawPayloadText,
  ]
    .filter(Boolean)
    .join(" ");
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
    workplaceType,
  });
  const dedupeFingerprint =
    job.dedupeFingerprint ??
    createJobDedupeFingerprint({
      applyUrl: validation.canonicalApplyUrl ?? job.applyUrl,
      companyName: job.companyName,
      externalSourceJobId: job.externalSourceJobId ?? job.externalId,
      location: job.location,
      title: job.title,
    });

  return {
    dedupeFingerprint,
    fullText,
    fullTokens: tokenize(fullText),
    job,
    locationText: normalizeHumanLabel(job.location ?? ""),
    parsedSalaryRange: parseSalaryRange(job.salaryText),
    semanticVector: buildWeightedVector({
      company: job.companyName,
      department: job.department,
      fullText,
      title: job.title,
    }),
    titleText: normalizeHumanLabel([job.title, job.normalizedTitle].filter(Boolean).join(" ")),
    titleTokens: tokenize([job.title, job.normalizedTitle].filter(Boolean).join(" ")),
    validation,
    workplaceType,
  } satisfies SearchJobDocument;
}

function matchesCompany(document: SearchJobDocument, companies: string[]) {
  if (companies.length === 0) {
    return true;
  }

  const haystack = normalizeHumanLabel(
    [document.job.companyName, document.job.normalizedCompanyName].filter(Boolean).join(" "),
  );

  return companies.some((company) => haystack.includes(normalizeHumanLabel(company)));
}

function matchesLocation(document: SearchJobDocument, locations: string[]) {
  if (locations.length === 0) {
    return true;
  }

  return locations.some((location) => document.locationText.includes(normalizeHumanLabel(location)));
}

function matchesEmploymentType(document: SearchJobDocument, employmentType: string | null) {
  if (!employmentType) {
    return true;
  }

  if (!document.job.commitment) {
    return true;
  }

  return normalizeHumanLabel(document.job.commitment).includes(normalizeHumanLabel(employmentType));
}

function matchesRemoteOnly(document: SearchJobDocument, remotePreference: JobSearchFiltersDto["remotePreference"]) {
  if (remotePreference !== "remote_only") {
    return true;
  }

  return document.workplaceType === "remote";
}

function matchesPostedWindow(document: SearchJobDocument, postedWithinDays: number | null) {
  if (!postedWithinDays) {
    return true;
  }

  const timestamp = getRecencyTimestamp(document.job);

  if (timestamp === null) {
    return false;
  }

  return Date.now() - timestamp <= postedWithinDays * 24 * 60 * 60 * 1_000;
}

function matchesSalaryRange(document: SearchJobDocument, salaryMin: number | null, salaryMax: number | null) {
  if (!salaryMin && !salaryMax) {
    return true;
  }

  if (!document.parsedSalaryRange.min && !document.parsedSalaryRange.max) {
    return true;
  }

  const candidateMin = document.parsedSalaryRange.min ?? document.parsedSalaryRange.max ?? null;
  const candidateMax = document.parsedSalaryRange.max ?? document.parsedSalaryRange.min ?? null;

  if (salaryMin && candidateMax && candidateMax < salaryMin) {
    return false;
  }

  if (salaryMax && candidateMin && candidateMin > salaryMax) {
    return false;
  }

  return true;
}

function matchesExclusions(document: SearchJobDocument, exclusions: string[]) {
  if (exclusions.length === 0) {
    return true;
  }

  const haystack = normalizeHumanLabel(document.fullText);

  return exclusions.every((exclusion) => !haystack.includes(normalizeHumanLabel(exclusion)));
}

function buildActiveWeights(args: {
  interpretation: JobSearchQueryInterpretationDto;
  profileContext: JobSeekerProfileContextDto | null;
}) {
  if (isFreshnessFirstBrowseInterpretation(args.interpretation)) {
    return {
      employmentType: 0,
      freshness: 0.72,
      industry: 0,
      lexical: 0,
      location: 0,
      mismatchPenalty: 0,
      profile: 0,
      remotePreference: 0,
      semantic: 0,
      seniority: 0,
      skill: 0,
      title: 0,
      trust: 0.28,
    } satisfies JobSearchRankingSummaryDto["weights"];
  }

  return {
    employmentType: args.interpretation.employmentType ? 0.05 : 0,
    freshness: 0.07,
    industry: args.interpretation.industries.length > 0 ? 0.08 : 0,
    lexical: 0.18,
    location: args.interpretation.locations.length > 0 ? 0.12 : 0,
    mismatchPenalty: 0.38,
    profile: args.profileContext ? 0.08 : 0,
    remotePreference: args.interpretation.remotePreference ? 0.08 : 0,
    semantic: 0.18,
    seniority: args.interpretation.seniority ? 0.06 : 0,
    skill: args.interpretation.skills.length > 0 ? 0.1 : 0,
    title: args.interpretation.normalizedRoles.length > 0 ? 0.2 : 0,
    trust: 0.08,
  } satisfies JobSearchRankingSummaryDto["weights"];
}

function computeFreshnessScore(job: JobPostingDto) {
  const timestamp = getRecencyTimestamp(job);

  if (timestamp === null) {
    return 0;
  }

  return clamp(
    1 - (Date.now() - timestamp) / (DEFAULT_SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1_000),
  );
}

function computeLocationScore(document: SearchJobDocument, interpretation: JobSearchQueryInterpretationDto) {
  if (interpretation.locations.length === 0) {
    return 0;
  }

  return matchesLocation(document, interpretation.locations) ? 1 : 0;
}

function computeRemotePreferenceScore(
  document: SearchJobDocument,
  interpretation: JobSearchQueryInterpretationDto,
) {
  if (!interpretation.remotePreference) {
    return 0;
  }

  if (interpretation.remotePreference === "remote_only") {
    return document.workplaceType === "remote" ? 1 : 0;
  }

  if (interpretation.remotePreference === "remote_preferred") {
    return document.workplaceType === "remote" ? 1 : document.workplaceType === "hybrid" ? 0.5 : 0;
  }

  if (interpretation.remotePreference === "hybrid_preferred") {
    return document.workplaceType === "hybrid" ? 1 : document.workplaceType === "remote" ? 0.45 : 0;
  }

  if (interpretation.remotePreference === "onsite_preferred") {
    return document.workplaceType === "onsite" ? 1 : 0;
  }

  return 0.5;
}

function computeEmploymentTypeScore(
  document: SearchJobDocument,
  interpretation: JobSearchQueryInterpretationDto,
) {
  if (!interpretation.employmentType) {
    return 0;
  }

  if (!document.job.commitment) {
    return 0.35;
  }

  return normalizeHumanLabel(document.job.commitment).includes(
    normalizeHumanLabel(interpretation.employmentType),
  )
    ? 1
    : 0;
}

function computeTitleMatchScore(document: SearchJobDocument, interpretation: JobSearchQueryInterpretationDto) {
  if (interpretation.normalizedRoles.length === 0) {
    return 0;
  }

  const directPhraseScore = phraseMatchScore(interpretation.normalizedRoles, document.titleText);
  const adjacentPhraseScore = phraseMatchScore(interpretation.adjacentRoles, document.titleText) * 0.55;
  const tokenScore = overlapScore(
    interpretation.normalizedRoles.flatMap((role) => tokenize(role)),
    document.titleTokens,
  );

  return clamp(Math.max(directPhraseScore, tokenScore * 0.8, adjacentPhraseScore));
}

function computeLexicalScore(document: SearchJobDocument, interpretation: JobSearchQueryInterpretationDto) {
  const rolePhraseScore = phraseMatchScore(
    uniq([...interpretation.normalizedRoles, ...interpretation.companyTerms, ...interpretation.locations]),
    document.fullText,
  );
  const tokenScore = overlapScore(
    tokenize(interpretation.rawQuery),
    document.fullTokens,
  );
  const skillScore = overlapScore(
    interpretation.skills.flatMap((skill) => tokenize(skill)),
    document.fullTokens,
  );

  return clamp(rolePhraseScore * 0.55 + tokenScore * 0.3 + skillScore * 0.15);
}

function computeSemanticScore(
  document: SearchJobDocument,
  interpretation: JobSearchQueryInterpretationDto,
  queryVector: Map<string, number>,
) {
  if (interpretation.semanticThemes.length === 0 && interpretation.normalizedRoles.length === 0) {
    return 0;
  }

  return clamp(cosineSimilarity(queryVector, document.semanticVector));
}

function computeSkillOverlapScore(document: SearchJobDocument, interpretation: JobSearchQueryInterpretationDto) {
  if (interpretation.skills.length === 0) {
    return 0;
  }

  return overlapScore(
    interpretation.skills.flatMap((skill) => tokenize(skill)),
    document.fullTokens,
  );
}

function computeSeniorityScore(document: SearchJobDocument, interpretation: JobSearchQueryInterpretationDto) {
  if (!interpretation.seniority) {
    return 0;
  }

  const haystack = `${document.titleText} ${normalizeHumanLabel(document.fullText)}`;

  return haystack.includes(normalizeHumanLabel(interpretation.seniority)) ? 1 : 0;
}

function computeIndustryScore(document: SearchJobDocument, interpretation: JobSearchQueryInterpretationDto) {
  if (interpretation.industries.length === 0) {
    return 0;
  }

  const industryTags = buildIndustryTags(document.fullText);

  return overlapScore(interpretation.industries, industryTags);
}

function computeProfileAlignmentScore(
  document: SearchJobDocument,
  profileContext: JobSeekerProfileContextDto | null,
) {
  if (!profileContext) {
    return 0;
  }

  const profileTerms = uniq([
    profileContext.targetRole,
    profileContext.headline,
    profileContext.location,
    ...profileContext.signals,
  ]);

  return overlapScore(
    profileTerms.flatMap((term) => tokenize(term)),
    document.fullTokens,
  );
}

function computeMismatchPenalty(args: {
  breakdown: Omit<JobSearchRankingBreakdownDto, "finalScore" | "mismatchPenalty">;
  interpretation: JobSearchQueryInterpretationDto;
}) {
  let penalty = 0;

  if (
    args.interpretation.normalizedRoles.length > 0 &&
    args.breakdown.titleMatchScore < 0.18 &&
    args.breakdown.semanticScore < 0.22
  ) {
    penalty += 0.42;
  }

  if (args.interpretation.locations.length > 0 && args.breakdown.locationScore === 0) {
    penalty += 0.24;
  }

  if (args.interpretation.remotePreference === "remote_only" && args.breakdown.remotePreferenceScore === 0) {
    penalty += 0.28;
  }

  if (args.interpretation.seniority && args.breakdown.seniorityScore === 0) {
    penalty += 0.12;
  }

  if (args.interpretation.employmentType && args.breakdown.employmentTypeScore === 0) {
    penalty += 0.08;
  }

  return clamp(penalty);
}

function buildMatchReasons(args: {
  breakdown: JobSearchRankingBreakdownDto;
  document: SearchJobDocument;
  interpretation: JobSearchQueryInterpretationDto;
  profileContext: JobSeekerProfileContextDto | null;
}) {
  const reasons: string[] = [];

  if (args.breakdown.titleMatchScore >= 0.72 && args.interpretation.normalizedRoles[0]) {
    reasons.push(`title aligned with ${args.interpretation.normalizedRoles[0]}`);
  }

  if (args.breakdown.semanticScore >= 0.4 && args.interpretation.semanticThemes.length > 0) {
    reasons.push("description aligned with the requested role themes");
  }

  if (args.breakdown.skillOverlapScore > 0 && args.interpretation.skills.length > 0) {
    const matchedSkills = args.interpretation.skills
      .filter((skill) => args.document.fullTokens.includes(normalizeHumanLabel(skill)))
      .slice(0, 3);

    if (matchedSkills.length > 0) {
      reasons.push(`skills matched ${matchedSkills.join(", ")}`);
    }
  }

  if (args.breakdown.locationScore > 0 && args.interpretation.locations[0]) {
    reasons.push(`location matched ${args.interpretation.locations[0]}`);
  }

  if (args.breakdown.remotePreferenceScore > 0 && args.interpretation.remotePreference) {
    reasons.push("remote preference aligned");
  }

  if (args.breakdown.seniorityScore > 0 && args.interpretation.seniority) {
    reasons.push(`${args.interpretation.seniority} seniority aligned`);
  }

  if (args.breakdown.industryScore > 0 && args.interpretation.industries[0]) {
    reasons.push(`industry aligned with ${args.interpretation.industries[0]}`);
  }

  if (args.breakdown.profileAlignmentScore > 0.2 && args.profileContext?.targetRole) {
    reasons.push("aligned with your Career ID context");
  }

  if ((args.document.validation.trustScore ?? 0) >= 0.8) {
    reasons.push("validated from a trusted source");
  }

  if (args.breakdown.freshnessScore >= 0.75) {
    reasons.push("fresh posting");
  }

  return uniq(reasons).slice(0, 4);
}

function createRankingSummary(args: {
  interpretation: JobSearchQueryInterpretationDto;
  ranked: SearchRankedCandidate[];
  weights: JobSearchRankingSummaryDto["weights"];
}) {
  const topSignals = uniq(
    args.ranked
      .slice(0, 5)
      .flatMap((candidate) => candidate.matchReasons)
      .slice(0, 8),
  );

  return {
    scoringVersion: SEARCH_SCORING_VERSION,
    topSignals:
      topSignals.length > 0
        ? topSignals
        : [
            args.interpretation.normalizedRoles[0]
              ? `ranked around ${args.interpretation.normalizedRoles[0]}`
              : "ranked by trust, freshness, and alignment",
          ],
    weights: args.weights,
  } satisfies JobSearchRankingSummaryDto;
}

function inferResultQuality(
  candidates: SearchRankedCandidate[],
  interpretation: JobSearchQueryInterpretationDto,
) {
  if (candidates.length === 0) {
    return "empty" as const;
  }

  if (isFreshnessFirstBrowseInterpretation(interpretation)) {
    return "acceptable" as const;
  }

  const topScore = candidates[0]?.breakdown.finalScore ?? 0;
  const strongAlignedCount = candidates.filter(
    (candidate) => candidate.breakdown.finalScore >= 0.72 && candidate.breakdown.titleMatchScore >= 0.35,
  ).length;
  const acceptableAlignedCount = candidates.filter(
    (candidate) => candidate.breakdown.finalScore >= 0.56,
  ).length;

  if (topScore >= 0.74 && strongAlignedCount >= 2) {
    return "strong" as const;
  }

  if (topScore >= 0.56 && acceptableAlignedCount >= 2) {
    return "acceptable" as const;
  }

  return "weak" as const;
}

function sortCandidates(
  candidates: SearchRankedCandidate[],
  interpretation: JobSearchQueryInterpretationDto,
) {
  if (isFreshnessFirstBrowseInterpretation(interpretation)) {
    return [...candidates].sort(
      (left, right) =>
        right.breakdown.freshnessScore - left.breakdown.freshnessScore ||
        right.breakdown.trustScore - left.breakdown.trustScore ||
        (getRecencyTimestamp(right.job) ?? 0) - (getRecencyTimestamp(left.job) ?? 0) ||
        right.breakdown.finalScore - left.breakdown.finalScore,
    );
  }

  return [...candidates].sort(
    (left, right) =>
      right.breakdown.finalScore - left.breakdown.finalScore ||
      right.breakdown.titleMatchScore - left.breakdown.titleMatchScore ||
      right.breakdown.semanticScore - left.breakdown.semanticScore ||
      right.breakdown.lexicalScore - left.breakdown.lexicalScore,
  );
}

function createRailCards(results: JobPostingDto[]) {
  return results.map((job) => ({
    applyUrl: job.canonicalApplyUrl ?? job.applyUrl,
    company: job.companyName,
    jobId: job.id,
    location: job.location,
    matchReason: formatJobMatchReason({
      matchReason: job.matchSignals?.[0] ?? null,
      matchReasons: job.matchReasons,
      matchSummary: job.matchSummary,
    }),
    relevanceScore: job.relevanceScore ?? null,
    salaryText: job.salaryText ?? null,
    summary: job.descriptionSnippet ?? null,
    title: job.title,
    workplaceType: job.workplaceType ?? null,
  }));
}

function getRecencyTimestamp(job: Pick<JobPostingDto, "postedAt" | "updatedAt">) {
  const value = job.postedAt || job.updatedAt;

  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}

function scoreDocument(args: {
  activeWeights: JobSearchRankingSummaryDto["weights"];
  document: SearchJobDocument;
  interpretation: JobSearchQueryInterpretationDto;
  profileContext: JobSeekerProfileContextDto | null;
  queryVector: Map<string, number>;
}) {
  const partialBreakdown = {
    employmentTypeScore: computeEmploymentTypeScore(args.document, args.interpretation),
    freshnessScore: computeFreshnessScore(args.document.job),
    industryScore: computeIndustryScore(args.document, args.interpretation),
    lexicalScore: computeLexicalScore(args.document, args.interpretation),
    locationScore: computeLocationScore(args.document, args.interpretation),
    profileAlignmentScore: computeProfileAlignmentScore(args.document, args.profileContext),
    remotePreferenceScore: computeRemotePreferenceScore(args.document, args.interpretation),
    semanticScore: computeSemanticScore(args.document, args.interpretation, args.queryVector),
    seniorityScore: computeSeniorityScore(args.document, args.interpretation),
    skillOverlapScore: computeSkillOverlapScore(args.document, args.interpretation),
    titleMatchScore: computeTitleMatchScore(args.document, args.interpretation),
    trustScore: args.document.validation.trustScore ?? 0,
  } satisfies Omit<JobSearchRankingBreakdownDto, "finalScore" | "mismatchPenalty">;
  const positiveWeights = [
    args.activeWeights.title,
    args.activeWeights.lexical,
    args.activeWeights.semantic,
    args.activeWeights.skill,
    args.activeWeights.location,
    args.activeWeights.remotePreference,
    args.activeWeights.seniority,
    args.activeWeights.employmentType,
    args.activeWeights.industry,
    args.activeWeights.profile,
    args.activeWeights.freshness,
    args.activeWeights.trust,
  ].reduce((sum, value) => sum + value, 0);
  const weightedScore =
    partialBreakdown.titleMatchScore * args.activeWeights.title +
    partialBreakdown.lexicalScore * args.activeWeights.lexical +
    partialBreakdown.semanticScore * args.activeWeights.semantic +
    partialBreakdown.skillOverlapScore * args.activeWeights.skill +
    partialBreakdown.locationScore * args.activeWeights.location +
    partialBreakdown.remotePreferenceScore * args.activeWeights.remotePreference +
    partialBreakdown.seniorityScore * args.activeWeights.seniority +
    partialBreakdown.employmentTypeScore * args.activeWeights.employmentType +
    partialBreakdown.industryScore * args.activeWeights.industry +
    partialBreakdown.profileAlignmentScore * args.activeWeights.profile +
    partialBreakdown.freshnessScore * args.activeWeights.freshness +
    partialBreakdown.trustScore * args.activeWeights.trust;
  const mismatchPenalty = computeMismatchPenalty({
    breakdown: partialBreakdown,
    interpretation: args.interpretation,
  });
  const finalScore =
    positiveWeights > 0
      ? clamp(weightedScore / positiveWeights - mismatchPenalty * args.activeWeights.mismatchPenalty)
      : 0;

  const breakdown = {
    ...partialBreakdown,
    finalScore,
    mismatchPenalty,
  } satisfies JobSearchRankingBreakdownDto;
  const matchReasons = buildMatchReasons({
    breakdown,
    document: args.document,
    interpretation: args.interpretation,
    profileContext: args.profileContext,
  });

  const enrichedJob = {
    ...args.document.job,
    applicationPathType: args.document.validation.applicationPathType,
    canonicalApplyUrl:
      args.document.validation.canonicalApplyUrl ??
      args.document.job.canonicalApplyUrl ??
      args.document.job.applyUrl,
    canonicalJobUrl:
      args.document.validation.canonicalJobUrl ?? args.document.job.canonicalJobUrl ?? null,
    dedupeFingerprint: args.document.dedupeFingerprint,
    lastValidatedAt: new Date().toISOString(),
    matchReasons,
    matchSignals: matchReasons,
    matchSummary:
      matchReasons.length > 0
        ? matchReasons.slice(0, 2).join(", ")
        : "Grounded match from the live jobs inventory.",
    orchestrationReadiness: args.document.validation.orchestrationReadiness,
    rankingBreakdown: breakdown,
    redirectRequired: args.document.validation.redirectRequired,
    relevanceScore: breakdown.finalScore,
    salaryRange: args.document.parsedSalaryRange,
    searchReasons: matchReasons.map((reason) => normalizeHumanLabel(reason).replace(/\s+/g, "_")),
    sourceTrustTier: args.document.validation.sourceTrustTier,
    trustScore: args.document.validation.trustScore,
    validationStatus: args.document.validation.validationStatus,
    workplaceType: args.document.workplaceType,
  } satisfies JobPostingDto;

  return {
    breakdown,
    job: enrichedJob,
    matchReasons,
  } satisfies SearchRankedCandidate;
}

function minimumScoreThreshold(interpretation: JobSearchQueryInterpretationDto, profileContext: JobSeekerProfileContextDto | null) {
  if (interpretation.normalizedRoles.length > 0 || interpretation.skills.length > 0) {
    return 0.42;
  }

  if (profileContext) {
    return 0.28;
  }

  return 0.24;
}

function planFallback(args: {
  interpretation: JobSearchQueryInterpretationDto;
  query: JobSearchQueryDto;
}) {
  const nextFilters = structuredClone(args.query.filters);

  if (nextFilters.location && args.interpretation.remotePreference === "remote_only") {
    nextFilters.location = null;
    nextFilters.locations = [];

    return {
      broadenedFields: ["location"],
      nextQuery: {
        ...args.query,
        filters: nextFilters,
      },
      reason: "relaxed_location" as const,
    };
  }

  if (nextFilters.seniority) {
    nextFilters.seniority = null;

    return {
      broadenedFields: ["seniority"],
      nextQuery: {
        ...args.query,
        filters: nextFilters,
      },
      reason: "relaxed_seniority" as const,
    };
  }

  if (nextFilters.skills.length > 2) {
    nextFilters.skills = nextFilters.skills.slice(0, 2);

    return {
      broadenedFields: ["skills"],
      nextQuery: {
        ...args.query,
        filters: nextFilters,
      },
      reason: "trimmed_skills" as const,
    };
  }

  if (nextFilters.employmentType) {
    nextFilters.employmentType = null;

    return {
      broadenedFields: ["employmentType"],
      nextQuery: {
        ...args.query,
        filters: nextFilters,
      },
      reason: "relaxed_employment_type" as const,
    };
  }

  if ((nextFilters.salaryMin ?? nextFilters.salaryMax) !== null) {
    nextFilters.salaryMin = null;
    nextFilters.salaryMax = null;

    return {
      broadenedFields: ["salary"],
      nextQuery: {
        ...args.query,
        filters: nextFilters,
      },
      reason: "relaxed_salary" as const,
    };
  }

  const broadenedRoles = uniq([
    ...nextFilters.roleFamilies,
    ...args.interpretation.adjacentRoles,
  ]);

  if (broadenedRoles.length > nextFilters.roleFamilies.length) {
    nextFilters.roleFamilies = broadenedRoles;

    return {
      broadenedFields: ["roles"],
      nextQuery: {
        ...args.query,
        filters: nextFilters,
      },
      reason: "broadened_roles" as const,
    };
  }

  return {
    broadenedFields: [],
    nextQuery: null,
    reason: "none" as const,
  };
}

export function runHybridJobSearchPass(args: {
  fallbackApplied?: JobSearchFallbackDto;
  jobs: JobPostingDto[];
  limit: number;
  offset?: number;
  profileContext: JobSeekerProfileContextDto | null;
  query: JobSearchQueryDto;
  sourceCount: number;
}) {
  const startedAt = Date.now();
  const offset = args.offset ?? 0;
  const queryInterpretation = buildQueryInterpretation({
    profileContext: args.profileContext,
    query: args.query,
    rawQuery: args.query.effectivePrompt ?? args.query.prompt,
  });
  const appliedFilters = createAppliedFilters({
    limit: args.limit,
    offset,
    query: args.query,
    queryInterpretation,
  });
  const queryVector = buildQueryVector(queryInterpretation);
  const seenFingerprints = new Set<string>();
  const activeWeights = buildActiveWeights({
    interpretation: queryInterpretation,
    profileContext: args.profileContext,
  });
  const filteredDocuments: SearchJobDocument[] = [];
  let duplicateCount = 0;
  let invalidCount = 0;
  let staleCount = 0;
  let filteredOutCount = 0;

  for (const job of args.jobs) {
    if (appliedFilters.targetJobId && job.id === appliedFilters.targetJobId) {
      filteredOutCount += 1;
      continue;
    }

    const document = buildSearchDocument(job);

    if (seenFingerprints.has(document.dedupeFingerprint)) {
      duplicateCount += 1;
      filteredOutCount += 1;
      continue;
    }

    if (document.validation.validationStatus === "invalid" || document.validation.validationStatus === "expired") {
      invalidCount += 1;
      filteredOutCount += 1;
      continue;
    }

    if (document.validation.validationStatus === "stale") {
      staleCount += 1;
      filteredOutCount += 1;
      continue;
    }

    if (
      !matchesCompany(document, appliedFilters.companies) ||
      !matchesLocation(document, appliedFilters.locations) ||
      !matchesRemoteOnly(document, appliedFilters.remotePreference) ||
      !matchesEmploymentType(document, appliedFilters.employmentType) ||
      !matchesPostedWindow(document, appliedFilters.postedWithinDays) ||
      !matchesSalaryRange(document, appliedFilters.salaryMin, appliedFilters.salaryMax) ||
      !matchesExclusions(document, appliedFilters.exclusions)
    ) {
      filteredOutCount += 1;
      continue;
    }

    seenFingerprints.add(document.dedupeFingerprint);
    filteredDocuments.push(document);
  }

  const rankedCandidates = filteredDocuments.map((document) =>
    scoreDocument({
      activeWeights,
      document,
      interpretation: queryInterpretation,
      profileContext: args.profileContext,
      queryVector,
    }),
  );
  const lexicalCandidateCount = rankedCandidates.filter(
    (candidate) =>
      candidate.breakdown.titleMatchScore >= 0.18 || candidate.breakdown.lexicalScore >= 0.22,
  ).length;
  const semanticCandidateCount = rankedCandidates.filter(
    (candidate) => candidate.breakdown.semanticScore >= 0.2,
  ).length;
  const structuredCandidateCount = rankedCandidates.filter(
    (candidate) =>
      candidate.breakdown.locationScore > 0 ||
      candidate.breakdown.remotePreferenceScore > 0 ||
      candidate.breakdown.employmentTypeScore > 0 ||
      candidate.breakdown.industryScore > 0,
  ).length;
  const candidateThreshold = minimumScoreThreshold(queryInterpretation, args.profileContext);
  const thresholdCandidates = rankedCandidates.filter(
    (candidate) => candidate.breakdown.finalScore >= candidateThreshold,
  );
  const allowBaselineBackfill =
    queryInterpretation.normalizedRoles.length === 0 &&
    queryInterpretation.skills.length === 0 &&
    queryInterpretation.locations.length === 0;
  const baselineCandidates =
    thresholdCandidates.length > 0
      ? thresholdCandidates
      : allowBaselineBackfill
        ? [...rankedCandidates]
            .sort(
              (left, right) =>
                right.breakdown.freshnessScore - left.breakdown.freshnessScore ||
                right.breakdown.trustScore - left.breakdown.trustScore,
            )
            .slice(0, Math.max(args.limit * BASELINE_LIMIT_MULTIPLIER, 24))
        : [];
  const mergedCandidates = sortCandidates(baselineCandidates, queryInterpretation);
  const pagedResults = mergedCandidates
    .slice(offset, offset + args.limit)
    .map((candidate) => candidate.job);
  const resultQuality = inferResultQuality(mergedCandidates, queryInterpretation);
  const searchLatencyMs = Date.now() - startedAt;

  return {
    appliedFilters,
    debugMeta: {
      candidateCountAfterFiltering: filteredDocuments.length,
      candidateCountAfterMerging: mergedCandidates.length,
      duplicateCount,
      filteredOutCount,
      invalidCount,
      lexicalCandidateCount,
      mergedCandidateCount: mergedCandidates.length,
      searchLatencyMs,
      semanticCandidateCount,
      sourceCount: args.sourceCount,
      staleCount,
      structuredCandidateCount,
    },
    diagnostics: {
      duplicateCount,
      filteredOutCount,
      invalidCount,
      searchLatencyMs,
      sourceCount: args.sourceCount,
      staleCount,
    },
    queryInterpretation,
    rankingSummary: createRankingSummary({
      interpretation: queryInterpretation,
      ranked: mergedCandidates,
      weights: activeWeights,
    }),
    resultQuality,
    resolvedQuery: args.query,
    results: pagedResults,
    totalCandidateCount: mergedCandidates.length,
  } satisfies SearchPassResult;
}

export function runHybridJobSearch(args: {
  jobs: JobPostingDto[];
  limit: number;
  offset?: number;
  profileContext: JobSeekerProfileContextDto | null;
  query: JobSearchQueryDto;
  sourceCount: number;
}) {
  const initial = runHybridJobSearchPass(args);

  if (initial.resultQuality === "strong" || initial.resultQuality === "acceptable") {
    return {
      ...initial,
      fallbackApplied: {
        applied: false,
        broadenedFields: [],
        reason: "none" as const,
      } satisfies JobSearchFallbackDto,
    };
  }

  const fallbackPlan = planFallback({
    interpretation: initial.queryInterpretation,
    query: args.query,
  });

  if (!fallbackPlan.nextQuery) {
    return {
      ...initial,
      fallbackApplied: {
        applied: false,
        broadenedFields: [],
        reason: "none" as const,
      } satisfies JobSearchFallbackDto,
    };
  }

  const broadened = runHybridJobSearchPass({
    ...args,
    fallbackApplied: {
      applied: true,
      broadenedFields: fallbackPlan.broadenedFields,
      reason: fallbackPlan.reason,
    },
    query: fallbackPlan.nextQuery,
  });

  return {
    ...broadened,
    fallbackApplied: {
      applied: true,
      broadenedFields: fallbackPlan.broadenedFields,
      reason: fallbackPlan.reason,
    } satisfies JobSearchFallbackDto,
  };
}

export function buildRetrievalEmptyState(results: JobPostingDto[]) {
  return results.length === 0
    ? "No grounded job matches were found from the live inventory for the current search."
    : null;
}

export function buildRetrievalRailCards(results: JobPostingDto[]) {
  return createRailCards(results);
}
