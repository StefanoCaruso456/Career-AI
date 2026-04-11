import type {
  EmployerCandidateMatchDto,
  EmployerCandidateSearchFiltersDto,
  EmployerCandidateSearchInputMode,
  EmployerCandidateSearchQueryDto,
  EmployerCandidateSearchResponseDto,
} from "@/packages/contracts/src";
import { employerCandidateSearchResponseSchema } from "@/packages/contracts/src";
import {
  getPersistentCareerBuilderProfile,
  listPersistentCandidateContexts,
  listPersistentCareerBuilderEvidence,
  type PersistentTalentIdentityContext,
} from "@/packages/persistence/src";

const DEFAULT_SEARCH_LIMIT = 6;
const EMPLOYMENT_EVIDENCE_TEMPLATES = new Set([
  "offer-letters",
  "employment-history-reports",
  "promotion-letters",
  "company-letters",
  "hr-official-letters",
]);
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

type SearchableCandidate = {
  candidateId: string;
  careerId: string;
  careerIdUrl: string;
  currentRole: string | null;
  targetRole: string | null;
  fullName: string;
  headline: string | null;
  location: string | null;
  profileSummary: string | null;
  searchText: string;
  skillTerms: string[];
  displaySkills: string[];
  highlights: string[];
  priorEmployers: string[];
  credibilityScore: number;
  evidenceCount: number;
  verifiedExperienceCount: number;
  verificationSignal: string;
};

type ScoredCandidate = {
  candidate: EmployerCandidateMatchDto;
  score: number;
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

async function buildSearchableCandidate(
  context: PersistentTalentIdentityContext,
): Promise<SearchableCandidate | null> {
  const profile = await getPersistentCareerBuilderProfile({
    careerIdentityId: context.aggregate.talentIdentity.id,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const evidence = await listPersistentCareerBuilderEvidence({
    careerIdentityId: context.aggregate.talentIdentity.id,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const onboardingProfile = context.onboarding.profile;
  const onboardingHeadline =
    typeof onboardingProfile.headline === "string" ? onboardingProfile.headline.trim() : "";
  const onboardingLocation =
    typeof onboardingProfile.location === "string" ? onboardingProfile.location.trim() : "";
  const onboardingIntent =
    typeof onboardingProfile.intent === "string" ? onboardingProfile.intent.trim() : "";
  const completedEvidence = evidence.filter((item) => item.status === "COMPLETE");
  const verifiedExperienceCount = completedEvidence.filter((item) =>
    EMPLOYMENT_EVIDENCE_TEMPLATES.has(item.templateId),
  ).length;
  const currentRole =
    profile?.careerHeadline?.trim() || onboardingHeadline || profile?.targetRole?.trim() || null;
  const targetRole = profile?.targetRole?.trim() || onboardingHeadline || null;
  const location = profile?.location?.trim() || onboardingLocation || null;
  const profileSummary = profile?.coreNarrative?.trim() || onboardingIntent || null;
  const displaySkills = uniq([
    ...(profile ? tokenize(profile.careerHeadline) : []),
    ...(profile ? tokenize(profile.targetRole) : []),
    ...(profile ? tokenize(profile.coreNarrative) : []),
    ...completedEvidence.flatMap((item) =>
      uniq([
        item.sourceOrIssuer,
        item.validationContext,
        item.whyItMatters,
      ]).flatMap((value) => tokenize(value)),
    ),
  ])
    .slice(0, 6)
    .map((term) => toDisplayTerm(term));
  const searchFragments = uniq([
    context.aggregate.talentIdentity.display_name,
    currentRole,
    targetRole,
    location,
    profileSummary,
    ...completedEvidence.map((item) => item.sourceOrIssuer),
    ...completedEvidence.map((item) => item.validationContext),
    ...completedEvidence.map((item) => item.whyItMatters),
  ]);

  if (searchFragments.length === 0) {
    return null;
  }

  const profileCompletion = Math.min(context.onboarding.profileCompletionPercent / 100, 1);
  const credibilityScore = Math.min(
    1,
    profileCompletion * 0.46 +
      Math.min(completedEvidence.length, 5) * 0.08 +
      Math.min(verifiedExperienceCount, 3) * 0.13 +
      (profile ? 0.12 : 0) +
      (context.aggregate.privacySettings.show_employment_records ? 0.05 : 0) +
      (context.aggregate.privacySettings.allow_public_share_link ? 0.04 : 0),
  );
  const verificationSignal =
    verifiedExperienceCount >= 1
      ? "Verified experience"
      : completedEvidence.length >= 2
        ? "Evidence-backed profile"
        : profileCompletion >= 0.7
          ? "Structured profile"
          : "Early profile";

  return {
    candidateId: context.aggregate.talentIdentity.id,
    careerId: context.aggregate.talentIdentity.talent_agent_id,
    careerIdUrl: `/employer/candidates?careerId=${encodeURIComponent(
      context.aggregate.talentIdentity.talent_agent_id,
    )}`,
    credibilityScore,
    currentRole,
    displaySkills,
    evidenceCount: completedEvidence.length,
    fullName: context.aggregate.talentIdentity.display_name,
    headline: currentRole,
    highlights: uniq([
      currentRole,
      targetRole ? `Targeting ${targetRole}` : null,
      ...completedEvidence.slice(0, 2).map((item) => item.whyItMatters || item.sourceOrIssuer),
    ]).slice(0, 3),
    location,
    priorEmployers: uniq(completedEvidence.map((item) => item.sourceOrIssuer)),
    profileSummary,
    searchText: searchFragments.join(" "),
    skillTerms: tokenize(searchFragments.join(" ")),
    targetRole,
    verificationSignal,
    verifiedExperienceCount,
  };
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

function scoreCandidate(args: {
  candidate: SearchableCandidate;
  query: EmployerCandidateSearchQueryDto;
}): ScoredCandidate | null {
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
  const credibilityLabel =
    credibilityScore >= 0.76
      ? "High credibility"
      : credibilityScore >= 0.56
        ? "Evidence-backed"
        : "Growing profile";

  return {
    score: roundedScore,
    candidate: {
      actions: {
        careerIdUrl: args.candidate.careerIdUrl,
        profileUrl: `/employer/candidates?candidateId=${encodeURIComponent(args.candidate.candidateId)}`,
      },
      candidateId: args.candidate.candidateId,
      careerId: args.candidate.careerId,
      credibility: {
        evidenceCount: args.candidate.evidenceCount,
        label: credibilityLabel,
        score: Math.round(args.candidate.credibilityScore * 100),
        verificationSignal: args.candidate.verificationSignal,
        verifiedExperienceCount: args.candidate.verifiedExperienceCount,
      },
      currentRole: args.candidate.currentRole,
      experienceHighlights: args.candidate.highlights,
      fullName: args.candidate.fullName,
      headline: args.candidate.headline,
      location: args.candidate.location,
      matchReason: buildMatchReason({
        candidate: args.candidate,
        credibilityScore,
        matchedSkills,
        query: args.query,
        titleScore,
      }),
      profileSummary: args.candidate.profileSummary,
      ranking: {
        label: rankingLabel,
        score: roundedScore,
      },
      targetRole: args.candidate.targetRole,
      topSkills: (matchedSkills.length > 0 ? matchedSkills : args.candidate.displaySkills).slice(0, 4).map((term) =>
        toDisplayTerm(term),
      ),
    },
  };
}

function buildAssistantMessage(args: {
  matches: EmployerCandidateMatchDto[];
  query: EmployerCandidateSearchQueryDto;
}) {
  if (args.matches.length === 0) {
    return "I could not find aligned Career ID candidates for that search yet. Try broadening the title, adding a few skills, or pasting the full job description.";
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
  let contexts: PersistentTalentIdentityContext[] = [];

  try {
    contexts = await listPersistentCandidateContexts();
  } catch {
    contexts = [];
  }

  const candidateCorpus = (
    await Promise.all(contexts.map((context) => buildSearchableCandidate(context)))
  ).filter((candidate): candidate is SearchableCandidate => Boolean(candidate));
  const scoredMatches = candidateCorpus
    .map((candidate) =>
      scoreCandidate({
        candidate,
        query,
      }),
    )
    .filter((match): match is ScoredCandidate => Boolean(match))
    .sort((left, right) => right.score - left.score);
  const limitedMatches = scoredMatches
    .slice(0, args.limit ?? DEFAULT_SEARCH_LIMIT)
    .map((match) => match.candidate);
  const response = employerCandidateSearchResponseSchema.parse({
    assistantMessage: buildAssistantMessage({
      matches: limitedMatches,
      query,
    }),
    candidates: limitedMatches,
    diagnostics: {
      candidateCount: candidateCorpus.length,
      filteredOutCount: Math.max(candidateCorpus.length - scoredMatches.length, 0),
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
