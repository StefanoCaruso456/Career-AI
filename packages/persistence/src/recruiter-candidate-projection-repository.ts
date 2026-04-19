import type { DatabaseQueryable } from "./client";
import { getDatabasePool, queryOptional, queryRequired } from "./client";

const EMPLOYMENT_EVIDENCE_TEMPLATES = new Set([
  "offer-letters",
  "employment-history-reports",
]);
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

type ProjectionContextRow = {
  career_identity_id: string;
  talent_agent_id: string;
  role_type: string | null;
  display_name: string;
  profile_completion_percent: number;
  profile_json: Record<string, unknown> | null;
  show_employment_records: boolean;
  allow_public_share_link: boolean;
  default_share_profile_id: string | null;
  career_headline: string | null;
  target_role: string | null;
  location: string | null;
  core_narrative: string | null;
};

type ProjectionEvidenceRow = {
  template_id: string;
  source_or_issuer: string;
  validation_context: string;
  why_it_matters: string;
  status: string;
  created_at: Date | string;
};

type ProjectionRow = {
  career_identity_id: string;
  talent_agent_id: string;
  role_type: string | null;
  recruiter_visibility: string;
  is_searchable: boolean;
  display_name: string;
  headline: string;
  target_role: string;
  location: string;
  profile_summary: string;
  current_employer: string | null;
  prior_employers_json: unknown;
  search_text: string;
  search_keywords_json: unknown;
  display_skills_json: unknown;
  experience_highlights_json: unknown;
  evidence_count: number;
  verified_experience_count: number;
  credibility_score: number | string;
  verification_signal: string;
  share_profile_id: string | null;
  public_share_token: string | null;
  updated_at: Date | string;
};

type ExistingProjectionRow = {
  share_profile_id: string | null;
  public_share_token: string | null;
};

type ComputedProjection = {
  candidateId: string;
  careerId: string;
  credibilityScore: number;
  currentEmployer: string | null;
  currentRole: string | null;
  displaySkills: string[];
  evidenceCount: number;
  fullName: string;
  headline: string | null;
  highlights: string[];
  location: string | null;
  priorEmployers: string[];
  profileSummary: string | null;
  recruiterVisibility: "limited" | "private" | "searchable";
  searchText: string;
  searchable: boolean;
  shareProfileId: string | null;
  publicShareToken: string | null;
  skillTerms: string[];
  targetRole: string | null;
  updatedAt: string;
  verificationSignal: string;
  verifiedExperienceCount: number;
};

export type PersistentRecruiterCandidateProjection = ComputedProjection & {
  careerIdUrl: string;
  lookupTokens: string[];
  profileUrl: string;
  shareProfileUrl: string | null;
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

function normalizeText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function nullIfEmpty(value: string) {
  const normalized = normalizeText(value);
  return normalized ?? null;
}

function normalizeRecruiterVisibility(value: unknown): "limited" | "private" | "searchable" {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (normalized === "limited" || normalized === "private") {
    return normalized;
  }

  return "searchable";
}

function formatIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stripEmployerLabel(value: string) {
  return value.replace(/ verified employment record$/i, "").replace(/\s+/g, " ").trim();
}

function firstSentence(value: string | null) {
  if (!value) {
    return null;
  }

  const [sentence] = value.split(".");
  return sentence?.trim() || value;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      return parseStringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function buildLookupTokens(args: {
  candidateId: string;
  careerId: string;
  publicShareToken: string | null;
  shareProfileId: string | null;
}) {
  return uniq([
    normalizeLookupToken(args.candidateId),
    normalizeLookupToken(args.careerId),
    args.shareProfileId ? normalizeLookupToken(args.shareProfileId) : null,
    args.publicShareToken ? normalizeLookupToken(args.publicShareToken) : null,
  ]);
}

async function loadProjectionContext(queryable: DatabaseQueryable, careerIdentityId: string) {
  return queryOptional<ProjectionContextRow>(
    queryable,
    `
      SELECT
        ci.id AS career_identity_id,
        ci.talent_agent_id,
        ci.role_type,
        ci.display_name,
        ci.profile_completion_percent,
        ci.profile_json,
        ps.show_employment_records,
        ps.allow_public_share_link,
        sr.default_share_profile_id,
        cbp.career_headline,
        cbp.target_role,
        cbp.location,
        cbp.core_narrative
      FROM career_identities ci
      INNER JOIN privacy_settings ps ON ps.career_identity_id = ci.id
      INNER JOIN soul_records sr ON sr.career_identity_id = ci.id
      LEFT JOIN career_builder_profiles cbp ON cbp.career_identity_id = ci.id
      WHERE ci.id = $1
    `,
    [careerIdentityId],
  );
}

async function loadCompletedEvidence(queryable: DatabaseQueryable, careerIdentityId: string) {
  const result = await queryable.query<ProjectionEvidenceRow>(
    `
      SELECT
        template_id,
        source_or_issuer,
        validation_context,
        why_it_matters,
        status,
        created_at
      FROM career_builder_evidence
      WHERE career_identity_id = $1
      ORDER BY created_at ASC, template_id ASC
    `,
    [careerIdentityId],
  );

  return result.rows.filter((row) => row.status === "COMPLETE");
}

function computeProjection(args: {
  context: ProjectionContextRow;
  evidence: ProjectionEvidenceRow[];
  publicShareToken: string | null;
  shareProfileId: string | null;
}) {
  const onboardingProfile = args.context.profile_json ?? {};
  const recruiterVisibility = normalizeRecruiterVisibility(onboardingProfile.recruiterVisibility);
  const onboardingHeadline =
    typeof onboardingProfile.headline === "string" ? onboardingProfile.headline.trim() : "";
  const onboardingIntent =
    typeof onboardingProfile.intent === "string" ? onboardingProfile.intent.trim() : "";
  const onboardingLocation =
    typeof onboardingProfile.location === "string" ? onboardingProfile.location.trim() : "";
  const currentRole =
    normalizeText(args.context.career_headline) ??
    normalizeText(onboardingHeadline) ??
    normalizeText(args.context.target_role);
  const targetRole =
    normalizeText(args.context.target_role) ?? normalizeText(onboardingHeadline);
  const location =
    normalizeText(args.context.location) ?? normalizeText(onboardingLocation);
  const profileSummary =
    normalizeText(args.context.core_narrative) ?? normalizeText(onboardingIntent);
  const canUseEmploymentSignals =
    recruiterVisibility !== "limited" && args.context.show_employment_records;
  const employerSignals = canUseEmploymentSignals
    ? uniq(args.evidence.map((item) => stripEmployerLabel(item.source_or_issuer)))
    : [];
  const currentEmployer = employerSignals[0] ?? null;
  const priorEmployers = employerSignals.slice(1);
  const searchFragments =
    recruiterVisibility === "private"
      ? []
      : uniq([
          args.context.display_name,
          currentRole,
          currentEmployer,
          targetRole,
          location,
          profileSummary,
          ...(canUseEmploymentSignals ? args.evidence.map((item) => item.source_or_issuer) : []),
          ...(canUseEmploymentSignals ? args.evidence.map((item) => item.validation_context) : []),
          ...(canUseEmploymentSignals ? args.evidence.map((item) => item.why_it_matters) : []),
        ]);
  const searchText = searchFragments.join(" ");
  const skillTerms = uniq([
    ...tokenize(currentRole ?? ""),
    ...tokenize(targetRole ?? ""),
    ...tokenize(profileSummary ?? ""),
    ...(canUseEmploymentSignals
      ? args.evidence.flatMap((item) =>
          uniq([
            item.source_or_issuer,
            item.validation_context,
            item.why_it_matters,
          ]).flatMap((value) => tokenize(value)),
        )
      : []),
  ]).slice(0, 32);
  const displaySkills = skillTerms.slice(0, 6).map((term) => toDisplayTerm(term));
  const verifiedExperienceCount = args.evidence.filter((item) =>
    EMPLOYMENT_EVIDENCE_TEMPLATES.has(item.template_id),
  ).length;
  const profileCompletion = Math.min(args.context.profile_completion_percent / 100, 1);
  const credibilityScore = Math.min(
    1,
    profileCompletion * 0.46 +
      Math.min(args.evidence.length, 5) * 0.08 +
      Math.min(verifiedExperienceCount, 3) * 0.13 +
      (currentRole || targetRole || profileSummary ? 0.12 : 0) +
      (args.context.show_employment_records ? 0.05 : 0) +
      (args.context.allow_public_share_link ? 0.04 : 0),
  );
  const verificationSignal =
    verifiedExperienceCount >= 1
      ? "Verified experience"
      : args.evidence.length >= 2
        ? "Evidence-backed profile"
        : profileCompletion >= 0.7
          ? "Structured profile"
          : "Early profile";
  const candidateEligible =
    args.context.role_type === null || args.context.role_type.trim().toLowerCase() === "candidate";
  const highlights = uniq([
    currentRole,
    targetRole ? `Targeting ${targetRole}` : null,
    ...(canUseEmploymentSignals
      ? args.evidence.slice(0, 2).map((item) => item.why_it_matters || item.source_or_issuer)
      : profileSummary
        ? [firstSentence(profileSummary)]
        : []),
  ]).slice(0, 3);
  const searchable =
    candidateEligible &&
    recruiterVisibility !== "private" &&
    searchText.trim().length > 0;

  return {
    candidateId: args.context.career_identity_id,
    careerId: args.context.talent_agent_id,
    credibilityScore,
    currentEmployer,
    currentRole,
    displaySkills,
    evidenceCount: args.evidence.length,
    fullName: args.context.display_name,
    headline: currentRole,
    highlights,
    location,
    priorEmployers,
    profileSummary,
    recruiterVisibility,
    searchText,
    searchable,
    shareProfileId: args.shareProfileId,
    publicShareToken: args.publicShareToken,
    skillTerms,
    targetRole,
    updatedAt: new Date().toISOString(),
    verificationSignal,
    verifiedExperienceCount,
  } satisfies ComputedProjection;
}

function mapProjectionRow(row: ProjectionRow): PersistentRecruiterCandidateProjection {
  const shareProfileId = row.share_profile_id;
  const publicShareToken = row.public_share_token;
  const candidateId = row.career_identity_id;
  const careerId = row.talent_agent_id;

  return {
    candidateId,
    careerId,
    careerIdUrl: `/employer/candidates?careerId=${encodeURIComponent(careerId)}`,
    credibilityScore: Number(row.credibility_score),
    currentEmployer: row.current_employer,
    currentRole: nullIfEmpty(row.headline) ?? nullIfEmpty(row.target_role),
    displaySkills: parseStringArray(row.display_skills_json),
    evidenceCount: row.evidence_count,
    fullName: row.display_name,
    headline: nullIfEmpty(row.headline),
    highlights: parseStringArray(row.experience_highlights_json),
    location: nullIfEmpty(row.location),
    lookupTokens: buildLookupTokens({
      candidateId,
      careerId,
      publicShareToken,
      shareProfileId,
    }),
    priorEmployers: parseStringArray(row.prior_employers_json),
    profileSummary: nullIfEmpty(row.profile_summary),
    profileUrl: `/employer/candidates?candidateId=${encodeURIComponent(candidateId)}`,
    publicShareToken,
    recruiterVisibility: normalizeRecruiterVisibility(row.recruiter_visibility),
    searchText: row.search_text,
    searchable: row.is_searchable,
    shareProfileId,
    shareProfileUrl: publicShareToken ? `/share/${publicShareToken}` : null,
    skillTerms: parseStringArray(row.search_keywords_json),
    targetRole: nullIfEmpty(row.target_role),
    updatedAt: formatIsoString(row.updated_at),
    verificationSignal: row.verification_signal,
    verifiedExperienceCount: row.verified_experience_count,
  };
}

export async function refreshPersistentRecruiterCandidateProjection(args: {
  careerIdentityId: string;
  queryable?: DatabaseQueryable;
  shareProfileIdOptional?: string | null;
  publicShareTokenOptional?: string | null;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const context = await loadProjectionContext(queryable, args.careerIdentityId);

  if (!context) {
    return null;
  }

  const evidence = await loadCompletedEvidence(queryable, args.careerIdentityId);
  const existing = await queryOptional<ExistingProjectionRow>(
    queryable,
    `
      SELECT
        share_profile_id,
        public_share_token
      FROM recruiter_candidate_projections
      WHERE career_identity_id = $1
    `,
    [args.careerIdentityId],
  );
  const shareProfileId = context.allow_public_share_link
    ? args.shareProfileIdOptional ??
      context.default_share_profile_id ??
      existing?.share_profile_id ??
      null
    : null;
  const publicShareToken =
    context.allow_public_share_link && shareProfileId
      ? args.publicShareTokenOptional ??
        (existing?.share_profile_id === shareProfileId ? existing.public_share_token : null)
      : null;
  const projection = computeProjection({
    context,
    evidence,
    publicShareToken,
    shareProfileId,
  });
  const row = await queryRequired<ProjectionRow>(
    queryable,
    `
      INSERT INTO recruiter_candidate_projections (
        career_identity_id,
        talent_agent_id,
        role_type,
        recruiter_visibility,
        is_searchable,
        display_name,
        headline,
        target_role,
        location,
        profile_summary,
        current_employer,
        prior_employers_json,
        search_text,
        search_keywords_json,
        display_skills_json,
        experience_highlights_json,
        evidence_count,
        verified_experience_count,
        credibility_score,
        verification_signal,
        share_profile_id,
        public_share_token,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12::jsonb,
        $13,
        $14::jsonb,
        $15::jsonb,
        $16::jsonb,
        $17,
        $18,
        $19,
        $20,
        $21,
        $22,
        NOW()
      )
      ON CONFLICT (career_identity_id)
      DO UPDATE SET
        talent_agent_id = EXCLUDED.talent_agent_id,
        role_type = EXCLUDED.role_type,
        recruiter_visibility = EXCLUDED.recruiter_visibility,
        is_searchable = EXCLUDED.is_searchable,
        display_name = EXCLUDED.display_name,
        headline = EXCLUDED.headline,
        target_role = EXCLUDED.target_role,
        location = EXCLUDED.location,
        profile_summary = EXCLUDED.profile_summary,
        current_employer = EXCLUDED.current_employer,
        prior_employers_json = EXCLUDED.prior_employers_json,
        search_text = EXCLUDED.search_text,
        search_keywords_json = EXCLUDED.search_keywords_json,
        display_skills_json = EXCLUDED.display_skills_json,
        experience_highlights_json = EXCLUDED.experience_highlights_json,
        evidence_count = EXCLUDED.evidence_count,
        verified_experience_count = EXCLUDED.verified_experience_count,
        credibility_score = EXCLUDED.credibility_score,
        verification_signal = EXCLUDED.verification_signal,
        share_profile_id = EXCLUDED.share_profile_id,
        public_share_token = EXCLUDED.public_share_token,
        updated_at = NOW()
      RETURNING
        career_identity_id,
        talent_agent_id,
        role_type,
        recruiter_visibility,
        is_searchable,
        display_name,
        headline,
        target_role,
        location,
        profile_summary,
        current_employer,
        prior_employers_json,
        search_text,
        search_keywords_json,
        display_skills_json,
        experience_highlights_json,
        evidence_count,
        verified_experience_count,
        credibility_score,
        verification_signal,
        share_profile_id,
        public_share_token,
        updated_at
    `,
    [
      projection.candidateId,
      projection.careerId,
      context.role_type,
      projection.recruiterVisibility,
      projection.searchable,
      projection.fullName,
      projection.headline ?? "",
      projection.targetRole ?? "",
      projection.location ?? "",
      projection.profileSummary ?? "",
      projection.currentEmployer,
      JSON.stringify(projection.priorEmployers),
      projection.searchText,
      JSON.stringify(projection.skillTerms),
      JSON.stringify(projection.displaySkills),
      JSON.stringify(projection.highlights),
      projection.evidenceCount,
      projection.verifiedExperienceCount,
      projection.credibilityScore,
      projection.verificationSignal,
      projection.shareProfileId,
      projection.publicShareToken,
    ],
  );

  return mapProjectionRow(row);
}

export async function listPersistentRecruiterCandidateProjections(args?: {
  limit?: number;
  searchableOnly?: boolean;
}) {
  const limit = args?.limit ?? 250;
  const searchableOnly = args?.searchableOnly ?? true;
  const values: unknown[] = [];
  const whereClauses: string[] = [];

  if (searchableOnly) {
    values.push(true);
    whereClauses.push(`is_searchable = $${values.length}`);
  }

  values.push(limit);

  const result = await getDatabasePool().query<ProjectionRow>(
    `
      SELECT
        career_identity_id,
        talent_agent_id,
        role_type,
        recruiter_visibility,
        is_searchable,
        display_name,
        headline,
        target_role,
        location,
        profile_summary,
        current_employer,
        prior_employers_json,
        search_text,
        search_keywords_json,
        display_skills_json,
        experience_highlights_json,
        evidence_count,
        verified_experience_count,
        credibility_score,
        verification_signal,
        share_profile_id,
        public_share_token,
        updated_at
      FROM recruiter_candidate_projections
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, display_name ASC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows.map((row) => mapProjectionRow(row));
}

export async function findPersistentRecruiterCandidateProjectionByLookup(args: {
  lookup: string;
}) {
  const trimmedLookup = args.lookup.replace(/\s+/g, " ").trim();

  if (!trimmedLookup) {
    return null;
  }

  const row = await queryOptional<ProjectionRow>(
    getDatabasePool(),
    `
      SELECT
        career_identity_id,
        talent_agent_id,
        role_type,
        recruiter_visibility,
        is_searchable,
        display_name,
        headline,
        target_role,
        location,
        profile_summary,
        current_employer,
        prior_employers_json,
        search_text,
        search_keywords_json,
        display_skills_json,
        experience_highlights_json,
        evidence_count,
        verified_experience_count,
        credibility_score,
        verification_signal,
        share_profile_id,
        public_share_token,
        updated_at
      FROM recruiter_candidate_projections
      WHERE is_searchable = true
        AND (
          career_identity_id = $1
          OR talent_agent_id = $2
          OR share_profile_id = $3
          OR LOWER(COALESCE(public_share_token, '')) = LOWER($4)
        )
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [
      trimmedLookup,
      trimmedLookup.toUpperCase(),
      trimmedLookup.toLowerCase(),
      trimmedLookup,
    ],
  );

  return row ? mapProjectionRow(row) : null;
}

export async function findPersistentSharedRecruiterCandidateProjectionByLookup(args: {
  lookup: string;
}) {
  const trimmedLookup = args.lookup.replace(/\s+/g, " ").trim();

  if (!trimmedLookup) {
    return null;
  }

  const row = await queryOptional<ProjectionRow>(
    getDatabasePool(),
    `
      SELECT
        career_identity_id,
        talent_agent_id,
        role_type,
        recruiter_visibility,
        is_searchable,
        display_name,
        headline,
        target_role,
        location,
        profile_summary,
        current_employer,
        prior_employers_json,
        search_text,
        search_keywords_json,
        display_skills_json,
        experience_highlights_json,
        evidence_count,
        verified_experience_count,
        credibility_score,
        verification_signal,
        share_profile_id,
        public_share_token,
        updated_at
      FROM recruiter_candidate_projections
      WHERE share_profile_id = $1
        OR LOWER(COALESCE(public_share_token, '')) = LOWER($2)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [trimmedLookup.toLowerCase(), trimmedLookup],
  );

  return row ? mapProjectionRow(row) : null;
}
