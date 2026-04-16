import type {
  JobPostingDto,
  JobSeekerProfileContextDto,
  JobSearchAppliedFiltersDto,
  JobSearchDebugMetaDto,
  JobSearchFallbackDto,
  JobSearchOutcomeDto,
  JobSearchQueryDto,
  JobSearchQueryInterpretationDto,
  JobSearchQuerySummaryDto,
  JobSearchRankingSummaryDto,
  JobSeekerResultQuality,
} from "@/packages/contracts/src";

export type WorkplaceType = "remote" | "hybrid" | "onsite" | "unknown";
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "internship"
  | "temporary"
  | "unknown";
export type SeniorityLevel =
  | "intern"
  | "entry"
  | "associate"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "director"
  | "vp"
  | "executive"
  | "unknown";
export type SalaryPeriod = "yearly" | "monthly" | "hourly" | "unknown";
export type JobStatus = "active" | "closed" | "draft";
export type LocationMatchLevel = "city_state" | "metro" | "state" | "country" | "remote";

export interface CanonicalJobRecord {
  job_id: string;
  source: string;
  source_job_url: string | null;
  status: JobStatus;
  posted_at: string | null;
  updated_at: string | null;
  title: string;
  title_normalized: string;
  title_family: string | null;
  title_cluster: string | null;
  title_tokens: string[];
  company: {
    aliases: string[];
    name: string;
    normalized_name: string;
  };
  team: {
    department: string | null;
    name: string | null;
    normalized_name: string | null;
    org: string | null;
  };
  location: {
    city: string | null;
    country: string | null;
    country_code: string | null;
    hybrid_allowed: boolean | null;
    location_tokens: string[];
    metro: string | null;
    onsite_required: boolean | null;
    raw: string | null;
    remote_allowed: boolean | null;
    state: string | null;
    state_code: string | null;
    timezone: string | null;
  };
  workplace_type: {
    value: WorkplaceType;
  };
  employment_type: {
    value: EmploymentType;
  };
  seniority: {
    value: SeniorityLevel;
  };
  compensation: {
    compensation_tokens: string[];
    salary_currency: string | null;
    salary_max: number | null;
    salary_min: number | null;
    salary_period: SalaryPeriod;
  };
  requirements: {
    certifications: string[];
    degree_requirements: string[];
    preferred_skills: string[];
    required_skills: string[];
    years_experience_max: number | null;
    years_experience_min: number | null;
  };
  keywords: {
    domains: string[];
    industries: string[];
    responsibilities: string[];
    tools: string[];
  };
  eligibility: {
    clearance_required: boolean | null;
    clearance_type: string | null;
    sponsorship_available: boolean | null;
  };
  description: {
    normalized_text: string;
    raw_text: string;
    searchable_chunks: string[];
  };
  source_job: JobPostingDto;
}

export interface JobSearchRequestV2 {
  intent: "find_jobs";
  raw_query: string;
  keywords: string[];
  filters: {
    company?: {
      exclude?: string[];
      include?: string[];
    };
    compensation?: {
      currency?: string;
      highest_paying?: boolean;
      max?: number;
      min?: number;
      period?: SalaryPeriod;
      salary_transparency_only?: boolean;
      strict_minimum?: boolean;
    };
    eligibility?: {
      clearance_required?: boolean;
      clearance_type?: string[];
      sponsorship_available?: boolean;
    };
    employment_type?: {
      include?: EmploymentType[];
    };
    location?: {
      allow_remote_fallback?: boolean;
      city?: string[];
      country?: string[];
      country_code?: string[];
      hybrid_allowed?: boolean;
      metro?: string[];
      onsite_required?: boolean;
      remote_allowed?: boolean;
      state?: string[];
      state_code?: string[];
    };
    recency?: {
      label?: "today" | "last_24_hours" | "last_3_days" | "last_7_days" | "this_week" | "custom";
      posted_since?: string | null;
      posted_within_hours?: number;
    };
    seniority?: {
      include?: SeniorityLevel[];
    };
    skills?: {
      include?: string[];
      preferred?: string[];
      required?: string[];
    };
    team?: {
      include?: string[];
    };
    title?: {
      exclude?: string[];
      family?: string[];
      include?: string[];
      seniority?: SeniorityLevel[];
      clusters?: string[];
    };
    workplace_type?: {
      include?: WorkplaceType[];
    };
  };
  sort: {
    primary: "relevance" | "recency" | "compensation";
    secondary?: "relevance" | "recency" | "compensation";
  };
  widening_policy: {
    enabled: boolean;
    minimum_exact_matches: number;
  };
}

export interface LexicalCandidateScore {
  company: number;
  description: number;
  location: number;
  skills: number;
  team: number;
  title: number;
  total: number;
}

export interface SearchResultCandidate {
  compensationKnown: boolean;
  exactMatch: boolean;
  fallbackLabel: string | null;
  job: CanonicalJobRecord;
  lexicalScore: LexicalCandidateScore;
  matchReasons: string[];
  scoreBreakdown: {
    company: number;
    compensation: number;
    location: number;
    recency: number;
    semantic: number;
    skills: number;
    team: number;
    title: number;
    total: number;
    workplace: number;
  };
  snippets: string[];
}

export interface SearchStageSnapshot {
  countsByStage: Record<string, number>;
  zeroResultReasons: string[];
}

export interface JobSearchRuntimeResult {
  appliedFilters: JobSearchAppliedFiltersDto;
  assistantMessage: string;
  debugMeta: JobSearchDebugMetaDto;
  diagnostics: {
    duplicateCount: number;
    filteredOutCount: number;
    invalidCount: number;
    searchLatencyMs: number;
    sourceCount: number;
    staleCount: number;
  };
  fallbackApplied: JobSearchFallbackDto;
  generatedAt: string;
  profileContext: JobSeekerProfileContextDto | null;
  query: JobSearchQueryDto;
  queryInterpretation: JobSearchQueryInterpretationDto;
  querySummary: JobSearchQuerySummaryDto;
  rankingSummary: JobSearchRankingSummaryDto;
  rail: {
    cards: Array<{
      applyUrl: string;
      company: string;
      jobId: string;
      location: string | null;
      matchReason: string;
      relevanceScore: number | null;
      salaryText: string | null;
      summary: string | null;
      title: string;
      workplaceType: WorkplaceType | null;
    }>;
    emptyState: string | null;
    filterOptions: {
      companies: string[];
      locations: string[];
    };
  };
  resultQuality: JobSeekerResultQuality;
  results: JobPostingDto[];
  returnedCount: number;
  searchOutcome: JobSearchOutcomeDto;
  totalCandidateCount: number;
}

export interface JobSearchCatalogV2Args {
  conversationId?: string | null;
  limit?: number;
  offset?: number;
  origin?: "chat_prompt" | "panel_refresh" | "cta" | "api";
  ownerId?: string | null;
  profileContext?: JobSeekerProfileContextDto | null;
  prompt?: string;
  query?: JobSearchQueryDto;
  refresh?: boolean;
}
