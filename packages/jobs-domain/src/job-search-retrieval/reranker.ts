import { buildLocationMatchLabel, type HardFilterMatch } from "./retrieval-engine";
import { buildWeightedVector, clamp, cosineSimilarity, normalizeText, overlapScore, tokenize, uniqueStrings } from "./utils";
import type { CanonicalJobRecord, JobSearchRequestV2, LexicalCandidateScore, SearchResultCandidate } from "./types";

const RANK_WEIGHTS = {
  company_exact: 20,
  compensation_match: 15,
  location_exact: 20,
  location_state: 10,
  recency_exact: 18,
  remote_match: 12,
  required_skills_overlap: 25,
  semantic_similarity: 8,
  team_match: 12,
  title_exact: 25,
  title_family: 15,
  workplace_match: 12,
} as const;

function buildQueryTerms(request: JobSearchRequestV2) {
  return uniqueStrings([
    ...(request.filters.title?.include ?? []),
    ...(request.filters.title?.family ?? []),
    ...(request.filters.skills?.include ?? []),
    ...(request.filters.team?.include ?? []),
    ...(request.filters.company?.include ?? []),
    ...request.keywords,
  ]);
}

function computeLexicalScore(job: CanonicalJobRecord, request: JobSearchRequestV2): LexicalCandidateScore {
  const normalizedTitle = normalizeText(job.title);
  const queryTitleTerms = request.filters.title?.include ?? [];
  const queryFamilyTerms = request.filters.title?.family ?? [];
  const querySkillTerms = request.filters.skills?.include ?? [];
  const queryTeamTerms = request.filters.team?.include ?? [];
  const queryCompanyTerms = request.filters.company?.include ?? [];
  const queryLocationTerms = uniqueStrings([
    ...(request.filters.location?.city ?? []),
    ...(request.filters.location?.state ?? []),
    ...(request.filters.location?.metro ?? []),
    ...(request.filters.location?.country ?? []),
  ]);

  const title =
    queryTitleTerms.length === 0
      ? 0
      : queryTitleTerms.some((term) => normalizedTitle.includes(normalizeText(term)))
        ? 1
        : queryFamilyTerms.some((term) => normalizeText(job.title_family).includes(normalizeText(term)))
          ? 0.65
          : 0;
  const skills = overlapScore(
    querySkillTerms,
    uniqueStrings([...job.requirements.required_skills, ...job.requirements.preferred_skills, ...job.keywords.tools]),
  );
  const team =
    queryTeamTerms.length === 0
      ? 0
      : queryTeamTerms.some((term) => normalizeText(job.team.normalized_name).includes(normalizeText(term)))
        ? 1
        : 0;
  const company =
    queryCompanyTerms.length === 0
      ? 0
      : queryCompanyTerms.some((term) => job.company.normalized_name === normalizeText(term))
        ? 1
        : 0;
  const location =
    queryLocationTerms.length === 0
      ? 0
      : queryLocationTerms.some((term) =>
          job.location.location_tokens.some((token) => token === normalizeText(term)),
        )
        ? 1
        : 0;
  const descriptionTokens = new Set(tokenize(job.description.raw_text));
  const descriptionMatches = buildQueryTerms(request).filter((term) =>
    tokenize(term).some((token) => descriptionTokens.has(token)),
  ).length;
  const description = buildQueryTerms(request).length > 0 ? descriptionMatches / buildQueryTerms(request).length : 0;

  return {
    company,
    description,
    location,
    skills,
    team,
    title,
    total: clamp(title * 0.35 + skills * 0.25 + company * 0.15 + team * 0.1 + location * 0.1 + description * 0.05),
  };
}

function buildQueryVector(request: JobSearchRequestV2) {
  return buildWeightedVector(
    uniqueStrings([
      ...(request.filters.title?.include ?? []),
      ...(request.filters.title?.family ?? []),
      ...(request.filters.title?.clusters ?? []),
      ...(request.filters.skills?.include ?? []),
      ...(request.filters.team?.include ?? []),
      ...request.keywords,
    ]).map((term) => ({
      term,
      weight:
        (request.filters.title?.include ?? []).includes(term)
          ? 2.5
          : (request.filters.skills?.include ?? []).includes(term)
            ? 2
            : 1,
    })),
  );
}

function buildJobVector(job: CanonicalJobRecord) {
  return buildWeightedVector([
    { term: job.title_normalized, weight: 2.5 },
    { term: job.title_family ?? "", weight: 1.8 },
    { term: job.title_cluster ?? "", weight: 1.4 },
    ...uniqueStrings([
      ...job.requirements.required_skills,
      ...job.requirements.preferred_skills,
      ...job.keywords.tools,
      ...job.keywords.industries,
      ...job.keywords.domains,
      job.team.name ?? "",
    ]).map((term) => ({
      term,
      weight: 1.2,
    })),
    ...tokenize(job.description.normalized_text)
      .slice(0, 80)
      .map((term) => ({
        term,
        weight: 0.3,
      })),
  ]);
}

function computeRecencyScore(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const timestamp = Date.parse(job.posted_at ?? job.updated_at ?? "");

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  const ageHours = (Date.now() - timestamp) / (60 * 60 * 1_000);

  if (!request.filters.recency) {
    return clamp(1 - ageHours / (24 * 14));
  }

  if (request.filters.recency.posted_within_hours) {
    return ageHours <= request.filters.recency.posted_within_hours
      ? 1
      : clamp(1 - ageHours / (request.filters.recency.posted_within_hours * 4));
  }

  return clamp(1 - ageHours / (24 * 7));
}

function computeCompensationScore(job: CanonicalJobRecord, request: JobSearchRequestV2, compensationKnown: boolean) {
  const requestedMin = request.filters.compensation?.min ?? null;
  const requestedMax = request.filters.compensation?.max ?? null;

  if (!request.filters.compensation) {
    return compensationKnown ? 0.5 : 0;
  }

  if (!compensationKnown) {
    return 0.15;
  }

  const candidateMin = job.compensation.salary_min ?? job.compensation.salary_max;
  const candidateMax = job.compensation.salary_max ?? job.compensation.salary_min;

  if (requestedMin && candidateMax !== null && candidateMax < requestedMin) {
    return 0;
  }

  if (requestedMax && candidateMin !== null && candidateMin > requestedMax) {
    return 0;
  }

  return 1;
}

function buildSnippets(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const queryTokens = new Set(buildQueryTerms(request).flatMap((term) => tokenize(term)));

  return job.description.searchable_chunks
    .filter((chunk) => tokenize(chunk).some((token) => queryTokens.has(token)))
    .slice(0, 2);
}

export function rerankCandidates(
  candidates: HardFilterMatch[],
  request: JobSearchRequestV2,
  options?: {
    exactMatch: boolean;
    fallbackLabel?: string | null;
  },
): SearchResultCandidate[] {
  const queryVector = buildQueryVector(request);

  return candidates
    .map((candidate) => {
      const lexical = computeLexicalScore(candidate.job, request);
      const semantic = clamp(cosineSimilarity(queryVector, buildJobVector(candidate.job)));
      const titleScore = lexical.title;
      const locationScore =
        candidate.locationLevel === "city_state"
          ? 1
          : candidate.locationLevel === "metro"
            ? 0.72
            : candidate.locationLevel === "state"
              ? 0.55
              : candidate.locationLevel === "country"
                ? 0.38
                : candidate.locationLevel === "remote"
                  ? 0.48
                  : 0;
      const workplaceScore =
        request.filters.workplace_type?.include?.length
          ? request.filters.workplace_type.include.includes(candidate.job.workplace_type.value)
            ? 1
            : 0
          : 0;
      const teamScore =
        request.filters.team?.include?.length
          ? overlapScore(request.filters.team.include, [candidate.job.team.name ?? "", candidate.job.team.department ?? ""])
          : 0;
      const companyScore =
        request.filters.company?.include?.length
          ? request.filters.company.include.includes(candidate.job.company.normalized_name)
            ? 1
            : 0
          : 0;
      const skillsScore = overlapScore(
        request.filters.skills?.include ?? [],
        uniqueStrings([
          ...candidate.job.requirements.required_skills,
          ...candidate.job.requirements.preferred_skills,
          ...candidate.job.keywords.tools,
        ]),
      );
      const compensationScore = computeCompensationScore(candidate.job, request, candidate.compensationKnown);
      const recencyScore = computeRecencyScore(candidate.job, request);
      const totalWeight =
        RANK_WEIGHTS.title_exact +
        RANK_WEIGHTS.location_exact +
        RANK_WEIGHTS.required_skills_overlap +
        RANK_WEIGHTS.compensation_match +
        RANK_WEIGHTS.semantic_similarity +
        RANK_WEIGHTS.company_exact +
        RANK_WEIGHTS.team_match +
        RANK_WEIGHTS.workplace_match +
        RANK_WEIGHTS.recency_exact;
      const total =
        titleScore * RANK_WEIGHTS.title_exact +
        locationScore * RANK_WEIGHTS.location_exact +
        skillsScore * RANK_WEIGHTS.required_skills_overlap +
        compensationScore * RANK_WEIGHTS.compensation_match +
        semantic * RANK_WEIGHTS.semantic_similarity +
        companyScore * RANK_WEIGHTS.company_exact +
        teamScore * RANK_WEIGHTS.team_match +
        workplaceScore * RANK_WEIGHTS.workplace_match +
        recencyScore * RANK_WEIGHTS.recency_exact;

      return {
        compensationKnown: candidate.compensationKnown,
        exactMatch: options?.exactMatch ?? true,
        fallbackLabel: options?.fallbackLabel ?? null,
        job: candidate.job,
        lexicalScore: lexical,
        matchReasons: [],
        scoreBreakdown: {
          company: companyScore,
          compensation: compensationScore,
          location: locationScore,
          recency: recencyScore,
          semantic,
          skills: skillsScore,
          team: teamScore,
          title: titleScore,
          total: clamp(total / totalWeight),
          workplace: workplaceScore,
        },
        snippets: buildSnippets(candidate.job, request),
      } satisfies SearchResultCandidate;
    })
    .sort((left, right) => right.scoreBreakdown.total - left.scoreBreakdown.total);
}

export function buildCandidateLocationLabel(candidate: SearchResultCandidate) {
  return buildLocationMatchLabel(candidate.job, candidate.exactMatch ? candidate.job.location.city || candidate.job.location.state ? "city_state" : null : null);
}
