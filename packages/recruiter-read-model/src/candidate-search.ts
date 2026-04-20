import type {
  EmployerCandidateMatchDto,
  EmployerCandidateSearchFiltersDto,
  EmployerCandidateSearchInputMode,
  EmployerCandidateSearchQueryDto,
  EmployerCandidateSearchResponseDto,
} from "@/packages/contracts/src";
import {
  employerCandidateSearchResponseSchema,
  getLikelyEmployerCandidateNameLookup,
} from "@/packages/contracts/src";
import {
  listPersistentRecruiterCandidateProjections,
  searchPersistentRecruiterCandidateProjectionsByName,
  type PersistentRecruiterCandidateProjection,
} from "@/packages/persistence/src";
import { ensureRecruiterDemoDatasetLoaded } from "./demo-dataset";

const DEFAULT_SEARCH_LIMIT = 6;
const TITLE_KEYWORDS = [
  "engineer",
  "developer",
  "manager",
  "designer",
  "analyst",
  "scientist",
  "architect",
  "recruiter",
  "marketer",
  "consultant",
  "director",
  "lead",
  "specialist",
  "coordinator",
] as const;
const SKILL_STOPWORDS = new Set([
  "about",
  "ability",
  "aligned",
  "background",
  "candidate",
  "candidates",
  "company",
  "description",
  "enterprise",
  "experience",
  "find",
  "for",
  "from",
  "full",
  "good",
  "have",
  "hiring",
  "job",
  "looking",
  "manager",
  "must",
  "need",
  "role",
  "roles",
  "search",
  "skills",
  "someone",
  "source",
  "strong",
  "talent",
  "that",
  "their",
  "them",
  "this",
  "title",
  "using",
  "verified",
  "with",
  "work",
  "years",
]);
const CAREER_ID_LOOKUP_PATTERN = /\bTAID-\d{6}\b/gi;
const CANDIDATE_ID_LOOKUP_PATTERN = /\btal_[a-z0-9-]+\b/gi;
const SHARE_PROFILE_ID_LOOKUP_PATTERN = /\bshare_[a-z0-9-]+\b/gi;
const SHARE_TOKEN_LOOKUP_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

type SearchableCandidate = PersistentRecruiterCandidateProjection;

type ScoredCandidate = {
  candidate: EmployerCandidateMatchDto;
  score: number;
};

type NameLookup = {
  normalized: string;
  raw: string;
  tokens: string[];
};

function uniq(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.replace(/\s+/g, " ").trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function normalizeValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLookupToken(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (/^TAID-/i.test(normalized)) {
    return normalized.toUpperCase();
  }

  return normalized.toLowerCase();
}

function normalizeNameLookup(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function extractLookupTokens(prompt: string) {
  const matches = [
    ...prompt.matchAll(CAREER_ID_LOOKUP_PATTERN),
    ...prompt.matchAll(CANDIDATE_ID_LOOKUP_PATTERN),
    ...prompt.matchAll(SHARE_PROFILE_ID_LOOKUP_PATTERN),
    ...prompt.matchAll(SHARE_TOKEN_LOOKUP_PATTERN),
  ];

  return uniq(matches.map((match) => normalizeLookupToken(match[0] ?? "")));
}

function buildNameLookup(prompt: string): NameLookup | null {
  const raw = getLikelyEmployerCandidateNameLookup(prompt);

  if (!raw) {
    return null;
  }

  const normalized = normalizeNameLookup(raw);

  return {
    normalized,
    raw,
    tokens: normalized.split(" ").filter(Boolean),
  };
}

function tokenize(value: string) {
  return normalizeValue(value)
    .split(/[^a-z0-9+#./-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !SKILL_STOPWORDS.has(token));
}

function toDisplayTerm(value: string) {
  if (value.toUpperCase() === value) {
    return value;
  }

  if (/[+#./]/.test(value)) {
    return value;
  }

  return value
    .split(" ")
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

function deriveInputMode(prompt: string): EmployerCandidateSearchInputMode {
  const trimmedPrompt = prompt.trim();
  const normalizedPrompt = normalizeValue(trimmedPrompt);

  if (
    trimmedPrompt.length >= 260 ||
    /\n/.test(trimmedPrompt) ||
    /\b(responsibilities|requirements|qualifications|must have|nice to have|job description)\b/i.test(
      trimmedPrompt,
    )
  ) {
    return "job_description";
  }

  if (
    trimmedPrompt.length <= 80 &&
    trimmedPrompt.split(/\s+/).length <= 8 &&
    !/[?!]/.test(trimmedPrompt) &&
    TITLE_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))
  ) {
    return "job_title";
  }

  return "free_text";
}

function extractLocation(prompt: string) {
  const match = prompt.match(
    /\b(?:in|near|around|based in|located in)\s+([a-z0-9&.,' -]+?)(?=(?:\s+\b(?:with|who|and|for|from|requiring|needing)\b|[.?!]|$))/i,
  );

  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractYearsExperience(prompt: string) {
  const match = prompt.match(/\b(\d{1,2})\+?\s*(?:years|yrs)\b/i);

  return match ? Number(match[1]) : null;
}

function extractSeniority(prompt: string) {
  const match = prompt.match(
    /\b(entry|junior|associate|mid|senior|staff|principal|lead|director|head|vp|vice president)\b/i,
  );

  return match?.[1]?.trim() ?? null;
}

function extractTitleHints(prompt: string, filters: EmployerCandidateSearchFiltersDto) {
  if (filters.title?.trim()) {
    return [filters.title.trim()];
  }

  const trimmedPrompt = prompt.trim();
  const normalizedPrompt = normalizeValue(trimmedPrompt);

  if (
    trimmedPrompt.length <= 80 &&
    !/[?!]/.test(trimmedPrompt) &&
    TITLE_KEYWORDS.some((keyword) => normalizedPrompt.includes(keyword))
  ) {
    return [trimmedPrompt];
  }

  const matches = Array.from(
    trimmedPrompt.matchAll(
      /\b([A-Za-z0-9+/#&.-]+(?:\s+[A-Za-z0-9+/#&.-]+){0,3}\s+(?:engineer|developer|manager|designer|analyst|scientist|architect|recruiter|marketer|consultant|director|lead|specialist|coordinator))\b/gi,
    ),
  );

  return uniq(matches.map((match) => match[1])).slice(0, 4);
}

function extractIndustryHints(prompt: string, filters: EmployerCandidateSearchFiltersDto) {
  const hints = [...filters.priorEmployers];

  if (filters.industry) {
    hints.push(filters.industry);
  }

  const matches = Array.from(
    prompt.matchAll(
      /\b(fintech|healthcare|health tech|enterprise saas|saas|consumer|marketplace|b2b|ai|artificial intelligence|climate|cybersecurity|education|edtech)\b/gi,
    ),
  ).map((match) => match[1] ?? "");

  return uniq([...hints, ...matches]).slice(0, 6);
}

function extractSkillKeywords(prompt: string, filters: EmployerCandidateSearchFiltersDto) {
  const promptTokens = tokenize(prompt).slice(0, 18);

  return uniq([...filters.skills, ...promptTokens]).slice(0, 12);
}

function buildSearchQuery(args: {
  filters: EmployerCandidateSearchFiltersDto;
  prompt: string;
}): EmployerCandidateSearchQueryDto {
  const normalizedPrompt = normalizeValue(args.prompt);

  return {
    filters: args.filters,
    inputMode: deriveInputMode(args.prompt),
    normalizedPrompt,
    parsedCriteria: {
      industryHints: extractIndustryHints(args.prompt, args.filters),
      location: args.filters.location ?? extractLocation(args.prompt),
      priorEmployers: args.filters.priorEmployers,
      seniority: extractSeniority(args.prompt),
      skillKeywords: extractSkillKeywords(args.prompt, args.filters),
      titleHints: extractTitleHints(args.prompt, args.filters),
      yearsExperienceMin: args.filters.yearsExperienceMin ?? extractYearsExperience(args.prompt),
    },
    prompt: args.prompt.trim(),
  };
}

function shouldAutoloadRecruiterDemoDataset() {
  const explicitSetting = process.env.CAREER_AI_ENABLE_RECRUITER_DEMO_DATASET?.trim().toLowerCase();

  if (explicitSetting === "1" || explicitSetting === "true" || explicitSetting === "yes") {
    return true;
  }

  if (explicitSetting === "0" || explicitSetting === "false" || explicitSetting === "no") {
    return false;
  }

  return process.env.NODE_ENV !== "test";
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

  const normalizedHaystack = normalizeValue(haystack);
  const hits = queryPhrases.filter((phrase) => normalizedHaystack.includes(normalizeValue(phrase)));

  return hits.length / queryPhrases.length;
}

function buildMatchReason(args: {
  credibilityScore: number;
  query: EmployerCandidateSearchQueryDto;
  candidate: SearchableCandidate;
  matchedSkills: string[];
  titleScore: number;
}) {
  const reasons: string[] = [];

  if (args.titleScore > 0) {
    reasons.push(
      `Title overlap around ${
        args.candidate.currentRole ?? args.candidate.targetRole ?? args.query.parsedCriteria.titleHints[0]
      }.`,
    );
  }

  if (args.matchedSkills.length > 0) {
    reasons.push(
      `Skill overlap on ${args.matchedSkills.slice(0, 3).map((term) => toDisplayTerm(term)).join(", ")}.`,
    );
  }

  if (args.candidate.verifiedExperienceCount > 0) {
    reasons.push(
      `${args.candidate.verifiedExperienceCount} verified experience ${
        args.candidate.verifiedExperienceCount === 1 ? "signal" : "signals"
      } surfaced.`,
    );
  }

  if (args.credibilityScore >= 0.72) {
    reasons.push("Credibility score is in the higher-confidence tier.");
  }

  return reasons.slice(0, 3).join(" ");
}

function getCredibilityLabel(credibilityScore: number) {
  if (credibilityScore >= 0.76) {
    return "High credibility";
  }

  if (credibilityScore >= 0.56) {
    return "Evidence-backed";
  }

  return "Growing profile";
}

function buildLookupMatchReason(args: {
  candidate: SearchableCandidate;
  lookupTokens: string[];
}) {
  const matchedToken = args.lookupTokens.find((token) => args.candidate.lookupTokens.includes(token));

  if (!matchedToken) {
    return "Direct recruiter lookup matched this Career ID candidate.";
  }

  if (matchedToken.startsWith("taid-")) {
    return `Exact Career ID lookup matched ${matchedToken.toUpperCase()}.`;
  }

  if (matchedToken.startsWith("tal_")) {
    return "Exact candidate identifier lookup matched this Career ID profile.";
  }

  if (matchedToken.startsWith("share_")) {
    return "Exact recruiter-safe share profile lookup matched this candidate.";
  }

  return "Exact recruiter-safe share token lookup matched this candidate.";
}

function resolveNameLookupMatch(args: {
  candidate: SearchableCandidate;
  nameLookup: NameLookup;
}) {
  const normalizedCandidateName = normalizeNameLookup(args.candidate.fullName);

  if (normalizedCandidateName === args.nameLookup.normalized) {
    return "exact" as const;
  }

  if (normalizedCandidateName.includes(args.nameLookup.normalized)) {
    return "partial" as const;
  }

  const candidateTokens = new Set(normalizedCandidateName.split(" ").filter(Boolean));

  if (args.nameLookup.tokens.every((token) => candidateTokens.has(token))) {
    return "partial" as const;
  }

  return null;
}

function buildNameLookupMatchReason(args: {
  candidate: SearchableCandidate;
  matchType: "exact" | "partial";
}) {
  if (args.matchType === "exact") {
    return `Exact name lookup matched ${args.candidate.fullName}.`;
  }

  return `Name lookup matched ${args.candidate.fullName}.`;
}

function toEmployerCandidateMatch(args: {
  candidate: SearchableCandidate;
  rankingLabel: string;
  rankingScore: number;
  matchReason: string;
  topSkills: string[];
}): EmployerCandidateMatchDto {
  return {
    actions: {
      careerIdUrl: args.candidate.careerIdUrl,
      profileUrl: args.candidate.profileUrl,
      trustProfileUrl: args.candidate.shareProfileUrl,
    },
    candidateId: args.candidate.candidateId,
    careerId: args.candidate.careerId,
    credibility: {
      evidenceCount: args.candidate.evidenceCount,
      label: getCredibilityLabel(args.candidate.credibilityScore),
      score: Math.round(args.candidate.credibilityScore * 100),
      verificationSignal: args.candidate.verificationSignal,
      verifiedExperienceCount: args.candidate.verifiedExperienceCount,
    },
    currentEmployer: args.candidate.currentEmployer,
    currentRole: args.candidate.currentRole,
    experienceHighlights: args.candidate.highlights,
    fullName: args.candidate.fullName,
    headline: args.candidate.headline,
    location: args.candidate.location,
    matchReason: args.matchReason,
    profileSummary: args.candidate.profileSummary,
    ranking: {
      label: args.rankingLabel,
      score: args.rankingScore,
    },
    targetRole: args.candidate.targetRole,
    topSkills: args.topSkills,
  };
}

function scoreCandidate(args: {
  candidate: SearchableCandidate;
  nameLookup: NameLookup | null;
  query: EmployerCandidateSearchQueryDto;
  lookupTokens: string[];
}): ScoredCandidate | null {
  const exactLookupMatch = args.lookupTokens.some((token) => args.candidate.lookupTokens.includes(token));
  const nameLookupMatch = args.nameLookup
    ? resolveNameLookupMatch({
        candidate: args.candidate,
        nameLookup: args.nameLookup,
      })
    : null;
  const normalizedLocation = args.query.filters.location
    ? normalizeValue(args.query.filters.location)
    : args.query.parsedCriteria.location
      ? normalizeValue(args.query.parsedCriteria.location)
      : null;
  const candidateLocation = args.candidate.location ? normalizeValue(args.candidate.location) : "";
  const titleScore = phraseMatchScore(
    args.query.parsedCriteria.titleHints,
    uniq([
      args.candidate.currentRole,
      args.candidate.targetRole,
      args.candidate.headline,
    ]).join(" "),
  );
  const matchedSkills = args.query.parsedCriteria.skillKeywords.filter((term) =>
    args.candidate.skillTerms.includes(term),
  );
  const skillScore = overlapScore(args.query.parsedCriteria.skillKeywords, args.candidate.skillTerms);
  const summaryScore = overlapScore(
    tokenize(args.query.prompt),
    args.candidate.skillTerms,
  );
  const locationScore =
    normalizedLocation && candidateLocation.includes(normalizedLocation) ? 1 : 0;
  const priorEmployerScore =
    args.query.filters.priorEmployers.length > 0
      ? overlapScore(
          args.query.filters.priorEmployers.map((value) => normalizeValue(value)),
          args.candidate.priorEmployers.map((value) => normalizeValue(value)),
        )
      : 0;
  const credibilityScore = args.candidate.credibilityScore;

  if (args.query.filters.verifiedExperienceOnly && args.candidate.verifiedExperienceCount === 0) {
    return null;
  }

  if (
    args.query.filters.credibilityThreshold !== null &&
    credibilityScore < args.query.filters.credibilityThreshold
  ) {
    return null;
  }

  if (normalizedLocation && candidateLocation && !candidateLocation.includes(normalizedLocation)) {
    return null;
  }

  if (exactLookupMatch) {
    return {
      score: 100,
      candidate: toEmployerCandidateMatch({
        candidate: args.candidate,
        matchReason: buildLookupMatchReason({
          candidate: args.candidate,
          lookupTokens: args.lookupTokens,
        }),
        rankingLabel: "Exact match",
        rankingScore: 100,
        topSkills: args.candidate.displaySkills.slice(0, 4).map((term) => toDisplayTerm(term)),
      }),
    };
  }

  if (nameLookupMatch) {
    const rankingScore = nameLookupMatch === "exact" ? 99 : 92;

    return {
      score: rankingScore,
      candidate: toEmployerCandidateMatch({
        candidate: args.candidate,
        matchReason: buildNameLookupMatchReason({
          candidate: args.candidate,
          matchType: nameLookupMatch,
        }),
        rankingLabel: nameLookupMatch === "exact" ? "Exact match" : "Name match",
        rankingScore,
        topSkills: args.candidate.displaySkills.slice(0, 4).map((term) => toDisplayTerm(term)),
      }),
    };
  }

  const totalScore =
    titleScore * 38 +
    skillScore * 24 +
    summaryScore * 14 +
    locationScore * 8 +
    priorEmployerScore * 8 +
    credibilityScore * 20;
  const roundedScore = Math.max(0, Math.min(100, Math.round(totalScore)));
  const minimumScore =
    args.query.parsedCriteria.titleHints.length > 0 || args.query.parsedCriteria.skillKeywords.length > 0
      ? 18
      : 12;

  if (roundedScore < minimumScore) {
    return null;
  }

  const rankingLabel =
    roundedScore >= 78 ? "Strong match" : roundedScore >= 58 ? "Aligned" : "Worth review";

  return {
    score: roundedScore,
    candidate: toEmployerCandidateMatch({
      candidate: args.candidate,
      matchReason: buildMatchReason({
        candidate: args.candidate,
        credibilityScore,
        matchedSkills,
        query: args.query,
        titleScore,
      }),
      rankingLabel,
      rankingScore: roundedScore,
      topSkills: (matchedSkills.length > 0 ? matchedSkills : args.candidate.displaySkills)
        .slice(0, 4)
        .map((term) => toDisplayTerm(term)),
    }),
  };
}

function buildAssistantMessage(args: {
  matches: EmployerCandidateMatchDto[];
  nameLookup: NameLookup | null;
  query: EmployerCandidateSearchQueryDto;
  lookupTokens: string[];
}) {
  if (args.matches.length === 0) {
    if (args.lookupTokens.length > 0) {
      return "No Career ID candidate matched that direct lookup. Check the identifier and try again.";
    }

    if (args.nameLookup) {
      return `No searchable Career ID profile matched the name ${args.nameLookup.raw}. Check the spelling and try again.`;
    }

    return "I could not find aligned Career ID candidates for that search yet. Try broadening the title, adding a few skills, or pasting the full job description.";
  }

  if (args.lookupTokens.length > 0) {
    return `I resolved ${args.matches[0]?.fullName ?? "that candidate"} directly from the provided identifier and loaded the recruiter-safe Career ID result.`;
  }

  if (args.nameLookup) {
    const profileNoun = args.matches.length === 1 ? "profile" : "profiles";
    return `I found ${args.matches.length} Career ID ${profileNoun} matching ${args.nameLookup.raw} and loaded them into the recruiter rail.`;
  }

  const querySkillFallback = args.query.parsedCriteria.skillKeywords
    .slice(0, 2)
    .map((term) => toDisplayTerm(term))
    .join(" / ");
  const queryFocus =
    args.query.parsedCriteria.titleHints[0] ??
    args.query.filters.title ??
    (querySkillFallback || "this search");

  return `I ranked ${args.matches.length} aligned Career ID candidates for ${queryFocus}. Title overlap, skill coverage, and credibility signals are weighted together, with stronger evidence pushed higher in the rail.`;
}

export async function searchEmployerCandidates(args: {
  filters?: EmployerCandidateSearchFiltersDto;
  limit?: number;
  prompt: string;
}): Promise<EmployerCandidateSearchResponseDto> {
  const startedAt = Date.now();
  const filters: EmployerCandidateSearchFiltersDto = {
    certifications: [],
    credibilityThreshold: null,
    education: null,
    industry: null,
    location: null,
    priorEmployers: [],
    skills: [],
    title: undefined,
    verificationStatus: [],
    verifiedExperienceOnly: false,
    workAuthorization: null,
    yearsExperienceMin: null,
    ...args.filters,
  };
  const query = buildSearchQuery({
    filters,
    prompt: args.prompt,
  });
  const lookupTokens = extractLookupTokens(args.prompt);
  const nameLookup = lookupTokens.length === 0 ? buildNameLookup(args.prompt) : null;
  let candidateCorpus: SearchableCandidate[] = [];
  let candidateSource: SearchableCandidate[] = [];

  if (shouldAutoloadRecruiterDemoDataset()) {
    try {
      await ensureRecruiterDemoDatasetLoaded();
    } catch {
      // Fall back to whatever live data is already available.
    }
  }

  try {
    candidateCorpus = nameLookup
      ? await searchPersistentRecruiterCandidateProjectionsByName({
          limit: Math.max(args.limit ?? DEFAULT_SEARCH_LIMIT, 8),
          name: nameLookup.raw,
        })
      : await listPersistentRecruiterCandidateProjections({
          limit: 500,
        });
  } catch {
    candidateCorpus = [];
  }

  if (lookupTokens.length > 0) {
    candidateSource = candidateCorpus.filter((candidate) =>
      lookupTokens.some((token) => candidate.lookupTokens.includes(token)),
    );
  } else if (nameLookup && candidateCorpus.length === 0) {
    try {
      candidateCorpus = await listPersistentRecruiterCandidateProjections({
        limit: 500,
      });
    } catch {
      candidateCorpus = [];
    }

    candidateSource = candidateCorpus.filter(
      (candidate) =>
        resolveNameLookupMatch({
          candidate,
          nameLookup,
        }) !== null,
    );
  } else {
    candidateSource = candidateCorpus;
  }
  const scoredMatches = candidateSource
    .map((candidate) =>
      scoreCandidate({
        candidate,
        nameLookup,
        query,
        lookupTokens,
      }),
    )
    .filter((match): match is ScoredCandidate => Boolean(match))
    .sort(
      (left, right) =>
        right.score - left.score || left.candidate.fullName.localeCompare(right.candidate.fullName),
    );
  const limitedMatches = scoredMatches
    .slice(0, args.limit ?? DEFAULT_SEARCH_LIMIT)
    .map((match) => match.candidate);
  const response = employerCandidateSearchResponseSchema.parse({
    assistantMessage: buildAssistantMessage({
      matches: limitedMatches,
      nameLookup,
      query,
      lookupTokens,
    }),
    candidates: limitedMatches,
    diagnostics: {
      candidateCount: candidateCorpus.length,
      filteredOutCount: Math.max(candidateSource.length - scoredMatches.length, 0),
      highCredibilityCount: candidateCorpus.filter((candidate) => candidate.credibilityScore >= 0.76)
        .length,
      parsedSkillCount: query.parsedCriteria.skillKeywords.length,
      searchLatencyMs: Date.now() - startedAt,
    },
    generatedAt: new Date().toISOString(),
    panelCount: limitedMatches.length,
    query,
    totalMatches: scoredMatches.length,
  });

  return response;
}
