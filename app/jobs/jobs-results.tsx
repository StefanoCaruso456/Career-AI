"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ProfileCompletionGuard } from "@/components/easy-apply-profile/profile-completion-guard";
import { startJobApplyRun } from "@/lib/jobs/start-apply-run-client";
import { fetchJobDetails } from "@/components/jobs/job-details-client";
import { JobDetailsTrigger } from "@/components/jobs/job-details-trigger";
import {
  getJobApplyActionLabel,
  isAutonomousApplySupportedTarget,
} from "@/lib/jobs/apply-target";
import {
  formatSalaryTextForRail,
  getJobRailLocationLabel,
  sanitizeJobLocationText,
} from "@/components/jobs/job-rail-utils";
import { resolveSchemaFamilyForJob } from "@/lib/application-profiles/resolver";
import {
  jobsFeedResponseSchema,
  type JobsFeedResponseDto,
  type JobPostingDto,
  type JobSourceSnapshotDto,
} from "@/packages/contracts/src";
import {
  evaluateSalaryFilter,
  SALARY_RANGE_OPTIONS,
  type SalaryRangeFilter,
} from "./salary-filter-utils";
import { RecruiterMarketplacePanel } from "./recruiter-marketplace-panel";
import styles from "./page.module.css";

type JobsResultsProps = {
  jobs: JobPostingDto[];
  initialCompanyOptions?: string[];
  initialCount?: number;
  initialRequestLimit?: number;
  initialSources?: JobSourceSnapshotDto[];
  initialTotalAvailableCount?: number;
  loadMoreCount?: number;
};

type WorkplaceFilter = "all" | "remote" | "hybrid" | "onsite";
type DateFilter = "all" | "1d" | "7d" | "30d";
const EMPTY_COMPANY_OPTIONS: string[] = [];
const EMPTY_SOURCE_SNAPSHOTS: JobSourceSnapshotDto[] = [];
const DEFAULT_USA_ONLY_FILTER = true;
const USA_ONLY_STORAGE_KEY = "career-ai.jobs.filters.usa-only";
const US_STATE_CODES = new Set([
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "fl",
  "ga",
  "hi",
  "ia",
  "id",
  "il",
  "in",
  "ks",
  "ky",
  "la",
  "ma",
  "md",
  "me",
  "mi",
  "mn",
  "mo",
  "ms",
  "mt",
  "nc",
  "nd",
  "ne",
  "nh",
  "nj",
  "nm",
  "nv",
  "ny",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "va",
  "vt",
  "wa",
  "wi",
  "wv",
  "wy",
  "dc",
]);
const US_STATE_NAMES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
]);
const ROLE_TYPE_OPTIONS = [
  "ai-ml-engineering",
  "software-engineering",
  "frontend-engineering",
  "backend-engineering",
  "full-stack-engineering",
  "data-engineering",
  "data-science",
  "product-management",
  "product-design",
  "devops-sre",
  "cloud-platform",
  "security-engineering",
  "qa-automation",
  "mobile-engineering",
  "solutions-architecture",
] as const;
type RoleTypeFilter = (typeof ROLE_TYPE_OPTIONS)[number];

const ROLE_TYPE_LABELS: Record<RoleTypeFilter, string> = {
  "ai-ml-engineering": "AI / ML Engineering",
  "software-engineering": "Software Engineering",
  "frontend-engineering": "Frontend Engineering",
  "backend-engineering": "Backend Engineering",
  "full-stack-engineering": "Full-Stack Engineering",
  "data-engineering": "Data Engineering",
  "data-science": "Data Science",
  "product-management": "Product Management",
  "product-design": "Product Design",
  "devops-sre": "DevOps / SRE",
  "cloud-platform": "Cloud / Platform",
  "security-engineering": "Security Engineering",
  "qa-automation": "QA / Automation",
  "mobile-engineering": "Mobile Engineering",
  "solutions-architecture": "Solutions Architecture",
};

const SALARY_RANGE_LABELS: Record<Exclude<SalaryRangeFilter, "all">, string> = {
  "under-100k": "Under $100k",
  "100k-150k": "$100k - $150k",
  "150k-200k": "$150k - $200k",
  "200k-250k": "$200k - $250k",
  "250k-plus": "$250k+",
};

const ROLE_TYPE_KEYWORDS: Array<{
  roleType: RoleTypeFilter;
  keywords: string[];
}> = [
  {
    roleType: "solutions-architecture",
    keywords: [
      "solutions architect",
      "solution architect",
      "enterprise architect",
      "technical architect",
    ],
  },
  {
    roleType: "mobile-engineering",
    keywords: [
      "ios engineer",
      "ios developer",
      "android engineer",
      "android developer",
      "mobile engineer",
      "mobile developer",
      "react native",
      "swift engineer",
      "kotlin engineer",
    ],
  },
  {
    roleType: "qa-automation",
    keywords: [
      "qa engineer",
      "quality assurance",
      "test engineer",
      "automation engineer",
      "software engineer in test",
      "sdet",
    ],
  },
  {
    roleType: "security-engineering",
    keywords: [
      "security engineer",
      "security analyst",
      "application security",
      "product security",
      "cloud security",
      "threat detection",
      "security operations",
    ],
  },
  {
    roleType: "devops-sre",
    keywords: [
      "site reliability",
      "sre",
      "devops",
      "release engineer",
      "build engineer",
      "platform reliability",
    ],
  },
  {
    roleType: "cloud-platform",
    keywords: [
      "platform engineer",
      "cloud engineer",
      "cloud infrastructure",
      "infrastructure engineer",
      "distributed systems",
      "systems engineer",
      "kubernetes",
    ],
  },
  {
    roleType: "data-engineering",
    keywords: [
      "data engineer",
      "analytics engineer",
      "etl engineer",
      "data platform",
      "data warehouse",
    ],
  },
  {
    roleType: "data-science",
    keywords: [
      "data scientist",
      "research scientist",
      "decision scientist",
      "quantitative analyst",
      "applied scientist",
      "ml scientist",
    ],
  },
  {
    roleType: "ai-ml-engineering",
    keywords: [
      "ai engineer",
      "ml engineer",
      "machine learning engineer",
      "machine learning",
      "computer vision",
      "nlp engineer",
      "large language model",
      "llm",
      "generative ai",
      "gen ai",
      "prompt engineer",
      "applied ai",
    ],
  },
  {
    roleType: "frontend-engineering",
    keywords: [
      "frontend engineer",
      "front-end engineer",
      "front end engineer",
      "frontend developer",
      "front-end developer",
      "ui engineer",
      "web engineer",
      "design engineer",
    ],
  },
  {
    roleType: "backend-engineering",
    keywords: [
      "backend engineer",
      "back-end engineer",
      "back end engineer",
      "backend developer",
      "back-end developer",
      "api engineer",
      "server engineer",
    ],
  },
  {
    roleType: "full-stack-engineering",
    keywords: [
      "full-stack engineer",
      "full stack engineer",
      "fullstack engineer",
      "full-stack developer",
      "full stack developer",
      "fullstack developer",
    ],
  },
  {
    roleType: "product-management",
    keywords: [
      "product manager",
      "product lead",
      "group product manager",
      "technical product manager",
    ],
  },
  {
    roleType: "product-design",
    keywords: [
      "product designer",
      "product design",
      "content designer",
      "content design",
      "ux designer",
      "user experience designer",
      "ux researcher",
      "user researcher",
      "ui designer",
      "visual designer",
      "interaction designer",
      "service designer",
      "conversation designer",
      "design manager",
      "design director",
      "design lead",
      "staff designer",
      "principal designer",
      "ux writer",
      "content strategist",
      "experience designer",
      "ux/ui",
      "design systems",
    ],
  },
  {
    roleType: "software-engineering",
    keywords: [
      "software engineer",
      "software developer",
      "application engineer",
      "developer experience",
      "member of technical staff",
      "staff engineer",
      "principal engineer",
    ],
  },
];

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Freshness unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatRoleTypeLabel(value: RoleTypeFilter) {
  return ROLE_TYPE_LABELS[value];
}

function formatSalaryRangeLabel(value: Exclude<SalaryRangeFilter, "all">) {
  return SALARY_RANGE_LABELS[value];
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function hasOwnRecordEntry(record: Record<string, unknown>, jobId: string) {
  return Object.prototype.hasOwnProperty.call(record, jobId);
}

function createJobDetailsPreview(job: JobPostingDto) {
  return {
    applyUrl: job.applyUrl,
    company: job.companyName,
    descriptionSnippet: job.descriptionSnippet,
    employmentType: job.commitment,
    externalJobId: job.externalSourceJobId ?? job.externalId,
    id: job.id,
    location: job.location,
    postedAt: job.updatedAt ?? job.postedAt,
    sourceLabel: job.sourceLabel,
    sourceUrl: job.canonicalJobUrl ?? job.canonicalApplyUrl ?? job.applyUrl,
    title: job.title,
    workplaceType: job.workplaceType ?? "unknown",
  } as const;
}

function getTotalAvailableCount(sources: JobSourceSnapshotDto[]) {
  return sources
    .filter((source) => source.status === "connected")
    .reduce((sum, source) => sum + source.jobCount, 0);
}

function didHydrateFullJobsWindow(snapshot: JobsFeedResponseDto, requestedLimit: number) {
  const totalAvailableCount = getTotalAvailableCount(snapshot.sources);

  return snapshot.jobs.length < requestedLimit || snapshot.jobs.length >= totalAvailableCount;
}

function normalizeHumanLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesCompanyFilter(job: JobPostingDto, companyFilter: string) {
  if (companyFilter === "all") {
    return true;
  }

  const normalizedCompanyFilter = normalizeHumanLabel(companyFilter);

  return [job.companyName, job.normalizedCompanyName, job.sourceLabel]
    .filter((value): value is string => Boolean(value && value.trim()))
    .some((value) => normalizeHumanLabel(value) === normalizedCompanyFilter);
}

function matchesUsaDefaultFilter(job: JobPostingDto) {
  const rawLocation = job.location?.trim();

  if (!rawLocation) {
    return false;
  }

  const segments = rawLocation
    .split(/[|/]|(?:\s+-\s+)/)
    .flatMap((part) => part.split(","))
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";
  const countryLabel = getJobRailLocationLabel(rawLocation);

  if (US_STATE_CODES.has(lastSegment) || US_STATE_NAMES.has(lastSegment)) {
    return true;
  }

  if (countryLabel === "United States") {
    return true;
  }

  return countryLabel === null && inferWorkplaceMode(rawLocation) === "remote";
}

function getCompanyAvailableCount(sources: JobSourceSnapshotDto[], companyFilter: string) {
  if (companyFilter === "all") {
    return null;
  }

  const normalizedCompanyFilter = normalizeHumanLabel(companyFilter);
  const matchingSource = sources.find(
    (source) => normalizeHumanLabel(source.label) === normalizedCompanyFilter,
  );

  return matchingSource?.jobCount ?? null;
}

function getCompanyOptions(
  jobs: JobPostingDto[],
  sources: JobSourceSnapshotDto[] = [],
  seededCompanies: string[] = [],
) {
  return Array.from(
    new Set([
      ...seededCompanies,
      ...jobs.map((job) => job.companyName),
      ...sources
        .filter((source) => source.status === "connected")
        .map((source) => source.label),
    ]),
  ).sort((left, right) => left.localeCompare(right));
}

function inferWorkplaceMode(location: string | null): WorkplaceFilter {
  if (!location) {
    return "onsite";
  }

  const normalized = location.trim().toLowerCase();

  if (normalized.includes("remote")) {
    return "remote";
  }

  if (normalized.includes("hybrid")) {
    return "hybrid";
  }

  return "onsite";
}

function getJobTimestamp(job: JobPostingDto) {
  const value = job.updatedAt || job.postedAt;

  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}

function matchesRecencyFilter(job: JobPostingDto, dateFilter: DateFilter) {
  if (dateFilter === "all") {
    return true;
  }

  const timestamp = getJobTimestamp(job);

  if (timestamp === null) {
    return false;
  }

  const now = Date.now();
  const thresholdByFilter = {
    "1d": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  } as const;

  return now - timestamp <= thresholdByFilter[dateFilter];
}

function matchesKeyword(job: JobPostingDto, keyword: string) {
  if (!keyword) {
    return true;
  }

  const haystack = [
    job.title,
    job.companyName,
    job.location,
    job.department,
    job.commitment,
    job.descriptionSnippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(keyword);
}

function inferRoleType(job: JobPostingDto): RoleTypeFilter | "other" {
  const searchText = [job.normalizedTitle, job.title, job.department, job.descriptionSnippet]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const rule of ROLE_TYPE_KEYWORDS) {
    if (rule.keywords.some((keyword) => searchText.includes(keyword))) {
      return rule.roleType;
    }
  }

  return "other";
}

export function JobsResults({
  jobs,
  initialCompanyOptions = EMPTY_COMPANY_OPTIONS,
  initialCount = 24,
  initialRequestLimit = Number.MAX_SAFE_INTEGER,
  initialSources = EMPTY_SOURCE_SNAPSHOTS,
  initialTotalAvailableCount = jobs.length,
  loadMoreCount = 29,
}: JobsResultsProps) {
  const [loadedJobs, setLoadedJobs] = useState(jobs);
  const [sourceSnapshots, setSourceSnapshots] = useState(initialSources);
  const [companyOptions, setCompanyOptions] = useState(() =>
    getCompanyOptions(jobs, [], initialCompanyOptions),
  );
  const [companyScopedSnapshot, setCompanyScopedSnapshot] = useState<JobsFeedResponseDto | null>(null);
  const [companyScopeError, setCompanyScopeError] = useState<string | null>(null);
  const [loadedCompanyScopeKey, setLoadedCompanyScopeKey] = useState<string | null>(null);
  const [isLoadingCompanyScope, setIsLoadingCompanyScope] = useState(false);
  const [totalAvailableCount, setTotalAvailableCount] = useState(initialTotalAvailableCount);
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, string | null>>({});
  const [resolvedSalaryHydrations, setResolvedSalaryHydrations] = useState<Record<string, true>>(
    {},
  );
  const [keyword, setKeyword] = useState("");
  const [activeSurface, setActiveSurface] = useState<"jobs" | "recruiters">("jobs");
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());
  const [roleTypeFilter, setRoleTypeFilter] = useState<"all" | RoleTypeFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [workplaceFilter, setWorkplaceFilter] = useState<WorkplaceFilter>("all");
  const [salaryRangeFilter, setSalaryRangeFilter] = useState<SalaryRangeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [usaOnlyFilter, setUsaOnlyFilter] = useState(DEFAULT_USA_ONLY_FILTER);
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, jobs.length));
  const [hasMoreAvailable, setHasMoreAvailable] = useState(jobs.length >= initialRequestLimit);
  const [hasHydratedFullWindow, setHasHydratedFullWindow] = useState(
    () =>
      initialRequestLimit === Number.MAX_SAFE_INTEGER || initialTotalAvailableCount <= jobs.length,
  );
  const [isHydratingFullWindow, setIsHydratingFullWindow] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [fullWindowHydrationError, setFullWindowHydrationError] = useState<string | null>(null);
  const fullWindowHydrationInFlight = useRef(false);
  const companyScopeRequestSequence = useRef(0);
  const salaryHydrationInFlight = useRef(new Set<string>());
  const skipUsaOnlyPersistence = useRef(true);
  const companyScopedExpectedCount = getCompanyAvailableCount(sourceSnapshots, companyFilter);
  const companyScopeKey = companyFilter === "all" ? null : companyFilter;
  const activeJobs = companyFilter === "all" ? loadedJobs : (companyScopedSnapshot?.jobs ?? []);
  const resolvedActiveJobs = activeJobs.map((job) =>
    hasOwnRecordEntry(salaryOverrides, job.id)
      ? {
          ...job,
          salaryText: salaryOverrides[job.id],
        }
      : job,
  );
  const activeTotalAvailableCount =
    companyFilter === "all"
      ? totalAvailableCount
      : companyScopedSnapshot
        ? getTotalAvailableCount(companyScopedSnapshot.sources)
        : companyScopedExpectedCount ?? 0;
  const fullJobsWindowLimit = Math.max(totalAvailableCount, loadedJobs.length);
  const jobsMatchingNonSalaryFilters = resolvedActiveJobs.filter((job) => {
    const matchesRoleType = roleTypeFilter === "all" || inferRoleType(job) === roleTypeFilter;
    const matchesCompany = matchesCompanyFilter(job, companyFilter);
    const matchesCountry = !usaOnlyFilter || matchesUsaDefaultFilter(job);
    const matchesWorkplace =
      workplaceFilter === "all" || inferWorkplaceMode(job.location) === workplaceFilter;

    return (
      matchesCountry &&
      matchesRoleType &&
      matchesCompany &&
      matchesWorkplace &&
      matchesRecencyFilter(job, dateFilter) &&
      matchesKeyword(job, deferredKeyword)
    );
  });
  const salaryEvaluations = jobsMatchingNonSalaryFilters.map((job) => ({
    evaluation: evaluateSalaryFilter(job, salaryRangeFilter),
    job,
  }));
  const filteredJobs = salaryEvaluations
    .filter(({ evaluation }) => evaluation.matches)
    .map(({ job }) => job);
  const visibleJobs = filteredJobs.slice(0, visibleCount);
  const salaryHydrationCandidates =
    salaryRangeFilter !== "all"
      ? salaryEvaluations
          .filter(
            ({ evaluation }) =>
              evaluation.reason === "missing-salary" ||
              evaluation.reason === "unparseable-salary",
          )
          .map(({ job }) => job)
      : [];
  const unresolvedSalaryHydrationCandidates = salaryHydrationCandidates.filter(
    (job) => !hasOwnRecordEntry(resolvedSalaryHydrations, job.id),
  );
  const remainingCount = Math.max(filteredJobs.length - visibleCount, 0);
  const canRevealLoadedJobs = remainingCount > 0;
  const hasManualFilters =
    keyword.length > 0 ||
    roleTypeFilter !== "all" ||
    companyFilter !== "all" ||
    workplaceFilter !== "all" ||
    salaryRangeFilter !== "all" ||
    dateFilter !== "all";
  const showClearFiltersButton = hasManualFilters || !usaOnlyFilter;
  const canHydrateFullWindow =
    companyFilter === "all" &&
    initialRequestLimit !== Number.MAX_SAFE_INTEGER &&
    !hasHydratedFullWindow &&
    !fullWindowHydrationError &&
    fullJobsWindowLimit > loadedJobs.length;
  const isSearchingAllJobs =
    companyFilter === "all" &&
    (hasManualFilters || (usaOnlyFilter && filteredJobs.length === 0)) &&
    filteredJobs.length === 0 &&
    (canHydrateFullWindow || isHydratingFullWindow);
  const desiredSalaryMatchCount = Math.max(initialCount, visibleCount);
  const shouldHydrateSalaryCandidates =
    salaryRangeFilter !== "all" &&
    !isSearchingAllJobs &&
    filteredJobs.length < desiredSalaryMatchCount;
  const salaryHydrationPool =
    salaryRangeFilter === "all"
      ? visibleJobs
      : shouldHydrateSalaryCandidates
        ? unresolvedSalaryHydrationCandidates
        : [];
  const isSearchingSalaryMatches =
    !isSearchingAllJobs &&
    salaryRangeFilter !== "all" &&
    filteredJobs.length === 0 &&
    unresolvedSalaryHydrationCandidates.length > 0;
  const isLoadingCompanyResults = companyFilter !== "all" && isLoadingCompanyScope;
  const showLoadMore =
    companyFilter === "all" ? canRevealLoadedJobs || hasMoreAvailable : canRevealLoadedJobs;
  const resultsTotalLabel =
    hasManualFilters &&
    !isLoadingCompanyResults &&
    !isSearchingAllJobs &&
    !isSearchingSalaryMatches
      ? `${formatCount(filteredJobs.length)} ${pluralize(filteredJobs.length, "matching role")}`
      : `${formatCount(activeTotalAvailableCount)} jobs available`;

  function handleApplyJob(job: JobPostingDto) {
    return startJobApplyRun({
      canonicalApplyUrl: job.canonicalApplyUrl ?? job.applyUrl,
      jobId: job.id,
      metadata: {
        applyTargetAtsFamily: job.applyTarget?.atsFamily ?? null,
        applyTargetSupportStatus: job.applyTarget?.supportStatus ?? null,
        isOrchestrationReady: job.orchestrationReadiness ?? false,
        sourceLabel: job.sourceLabel,
        validationStatus: job.validationStatus ?? null,
      },
    });
  }

  function clearAllFilters() {
    setKeyword("");
    setRoleTypeFilter("all");
    setCompanyFilter("all");
    setWorkplaceFilter("all");
    setSalaryRangeFilter("all");
    setDateFilter("all");
    setUsaOnlyFilter(DEFAULT_USA_ONLY_FILTER);
  }

  useEffect(() => {
    setVisibleCount(Math.min(initialCount, filteredJobs.length || initialCount));
    setFullWindowHydrationError(null);
  }, [
    companyFilter,
    dateFilter,
    deferredKeyword,
    initialCount,
    roleTypeFilter,
    salaryRangeFilter,
    workplaceFilter,
  ]);

  useEffect(() => {
    setLoadedJobs(jobs);
    setSourceSnapshots(initialSources);
    setCompanyOptions(getCompanyOptions(jobs, [], initialCompanyOptions));
    setCompanyScopedSnapshot(null);
    setCompanyScopeError(null);
    setLoadedCompanyScopeKey(null);
    setIsLoadingCompanyScope(false);
    setSalaryOverrides({});
    setResolvedSalaryHydrations({});
    setHasMoreAvailable(jobs.length >= initialRequestLimit);
    setHasHydratedFullWindow(
      initialRequestLimit === Number.MAX_SAFE_INTEGER || initialTotalAvailableCount <= jobs.length,
    );
    setIsHydratingFullWindow(false);
    setFullWindowHydrationError(null);
    fullWindowHydrationInFlight.current = false;
    companyScopeRequestSequence.current += 1;
    salaryHydrationInFlight.current.clear();
    setLoadMoreError(null);
    setTotalAvailableCount(initialTotalAvailableCount);
    setVisibleCount(Math.min(initialCount, jobs.length));
    setActiveSurface("jobs");
  }, [
    initialCompanyOptions,
    initialRequestLimit,
    initialSources,
    initialTotalAvailableCount,
    jobs,
  ]);

  useEffect(() => {
    if (skipUsaOnlyPersistence.current) {
      return;
    }

    try {
      window.localStorage.setItem(USA_ONLY_STORAGE_KEY, usaOnlyFilter ? "true" : "false");
    } catch {
      // Ignore storage access failures so filtering still works in restricted contexts.
    }
  }, [usaOnlyFilter]);

  useEffect(() => {
    try {
      const storedPreference = window.localStorage.getItem(USA_ONLY_STORAGE_KEY);

      if (storedPreference === "false") {
        setUsaOnlyFilter(false);
      } else if (storedPreference === "true") {
        setUsaOnlyFilter(true);
      }
    } catch {
      // Ignore storage access failures and keep the safe default on.
    } finally {
      skipUsaOnlyPersistence.current = false;
    }
  }, []);

  async function fetchJobsWindow(limit: number, options?: { company?: string }) {
    const searchParams = new URLSearchParams({
      limit: String(limit),
    });

    if (options?.company) {
      searchParams.set("company", options.company);
    }

    const response = await fetch(`/api/v1/jobs?${searchParams.toString()}`, {
      cache: "no-store",
      method: "GET",
    });
    const payload = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      throw new Error(payload.error || payload.message || "Jobs could not be loaded right now.");
    }

    return jobsFeedResponseSchema.parse(payload);
  }

  function applySnapshot(
    snapshot: JobsFeedResponseDto,
    options?: {
      hasHydratedFullWindow?: boolean;
      hasMoreAvailable?: boolean;
    },
  ) {
    setLoadedJobs(snapshot.jobs);
    setSourceSnapshots(snapshot.sources);
    setCompanyOptions(getCompanyOptions(snapshot.jobs, snapshot.sources, initialCompanyOptions));
    setTotalAvailableCount(getTotalAvailableCount(snapshot.sources));

    if (typeof options?.hasHydratedFullWindow === "boolean") {
      setHasHydratedFullWindow(options.hasHydratedFullWindow);
    }

    if (typeof options?.hasMoreAvailable === "boolean") {
      setHasMoreAvailable(options.hasMoreAvailable);
    }
  }

  useEffect(() => {
    if (companyFilter === "all") {
      companyScopeRequestSequence.current += 1;
      setCompanyScopedSnapshot(null);
      setCompanyScopeError(null);
      setLoadedCompanyScopeKey(null);
      setIsLoadingCompanyScope(false);
      return;
    }

    if (companyScopedSnapshot && companyScopeKey && loadedCompanyScopeKey === companyScopeKey) {
      return;
    }

    const requestLimit =
      companyScopedExpectedCount && companyScopedExpectedCount > 0
        ? companyScopedExpectedCount
        : Math.max(activeTotalAvailableCount, loadedJobs.length, initialRequestLimit);
    const requestSequence = companyScopeRequestSequence.current + 1;

    companyScopeRequestSequence.current = requestSequence;
    setCompanyScopeError(null);
    setIsLoadingCompanyScope(true);
    setCompanyScopedSnapshot(null);

    void fetchJobsWindow(requestLimit, {
      company: companyFilter,
    })
      .then((snapshot) => {
        if (companyScopeRequestSequence.current !== requestSequence) {
          return;
        }

        setCompanyScopedSnapshot(snapshot);
        setLoadedCompanyScopeKey(companyScopeKey);
      })
      .catch((error) => {
        if (companyScopeRequestSequence.current !== requestSequence) {
          return;
        }

        setCompanyScopeError(
          error instanceof Error ? error.message : `${companyFilter} jobs could not be loaded right now.`,
        );
      })
      .finally(() => {
        if (companyScopeRequestSequence.current !== requestSequence) {
          return;
        }

        setIsLoadingCompanyScope(false);
      });
  }, [
    companyFilter,
    companyScopeKey,
    companyScopedExpectedCount,
    initialRequestLimit,
    loadedCompanyScopeKey,
    loadedJobs.length,
  ]);

  useEffect(() => {
    const jobsNeedingSalaryHydration = salaryHydrationPool
      .filter(
        (job) =>
          !hasOwnRecordEntry(resolvedSalaryHydrations, job.id) &&
          !salaryHydrationInFlight.current.has(job.id),
      )
      .slice(0, 12);

    if (jobsNeedingSalaryHydration.length === 0) {
      return;
    }

    const controller = new AbortController();

    jobsNeedingSalaryHydration.forEach((job) => {
      salaryHydrationInFlight.current.add(job.id);
    });

    void (async () => {
      const hydratedSalaries = await Promise.all(
        jobsNeedingSalaryHydration.map(async (job) => {
          try {
            const details = await fetchJobDetails(createJobDetailsPreview(job), {
              signal: controller.signal,
            });

            return {
              jobId: job.id,
              originalSalaryText: job.salaryText ?? null,
              salaryText: details.salaryText ?? null,
            } as const;
          } catch {
            return {
              jobId: job.id,
              originalSalaryText: job.salaryText ?? null,
              salaryText: null,
            } as const;
          } finally {
            salaryHydrationInFlight.current.delete(job.id);
          }
        }),
      );

      if (controller.signal.aborted) {
        return;
      }

      setSalaryOverrides((current) => {
        const next = { ...current };
        let changed = false;

        hydratedSalaries.forEach(({ jobId, originalSalaryText, salaryText }) => {
          if (
            hasOwnRecordEntry(current, jobId) ||
            !salaryText ||
            salaryText === originalSalaryText
          ) {
            return;
          }

          next[jobId] = salaryText;
          changed = true;
        });

        return changed ? next : current;
      });

      setResolvedSalaryHydrations((current) => {
        const next = { ...current };
        let changed = false;

        hydratedSalaries.forEach(({ jobId }) => {
          if (hasOwnRecordEntry(current, jobId)) {
            return;
          }

          next[jobId] = true;
          changed = true;
        });

        return changed ? next : current;
      });
    })();

    return () => {
      controller.abort();

      jobsNeedingSalaryHydration.forEach((job) => {
        salaryHydrationInFlight.current.delete(job.id);
      });
    };
  }, [resolvedSalaryHydrations, salaryHydrationPool]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || salaryRangeFilter === "all") {
      return;
    }

    const reasonCounts = salaryEvaluations.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.evaluation.reason] = (counts[entry.evaluation.reason] ?? 0) + 1;
      return counts;
    }, {});
    const sampleExcluded = salaryEvaluations
      .filter(({ evaluation }) => !evaluation.matches)
      .slice(0, 5)
      .map(({ evaluation, job }) => ({
        annualMax: evaluation.normalizedSalary?.annualMax ?? null,
        annualMin: evaluation.normalizedSalary?.annualMin ?? null,
        company: job.companyName,
        currency: evaluation.normalizedSalary?.currency ?? null,
        jobId: job.id,
        period: evaluation.normalizedSalary?.period ?? null,
        rawText:
          evaluation.normalizedSalary?.rawText ?? job.salaryText ?? job.salaryRange?.rawText ?? null,
        reason: evaluation.reason,
        title: job.title,
      }));

    console.debug("[JobsResults] salary filter diagnostics", {
      band: salaryEvaluations[0]?.evaluation.band ?? null,
      candidateCount: salaryEvaluations.length,
      filter: salaryRangeFilter,
      matchedCount: filteredJobs.length,
      remainingHydrationCandidates: unresolvedSalaryHydrationCandidates.length,
      reasonCounts,
      resolvedHydrationCount: Object.keys(resolvedSalaryHydrations).length,
      sampleExcluded,
    });
  }, [
    filteredJobs.length,
    resolvedSalaryHydrations,
    salaryEvaluations,
    salaryRangeFilter,
    unresolvedSalaryHydrationCandidates.length,
  ]);

  async function hydrateFullJobsWindow(requestedLimit = fullJobsWindowLimit) {
    if (
      requestedLimit <= loadedJobs.length ||
      hasHydratedFullWindow ||
      fullWindowHydrationInFlight.current
    ) {
      return;
    }

    fullWindowHydrationInFlight.current = true;
    setIsHydratingFullWindow(true);
    setFullWindowHydrationError(null);

    try {
      const snapshot = await fetchJobsWindow(requestedLimit);
      const hydratedFullWindow = didHydrateFullJobsWindow(snapshot, requestedLimit);

      applySnapshot(snapshot, {
        hasHydratedFullWindow: hydratedFullWindow,
        hasMoreAvailable: !hydratedFullWindow,
      });
    } catch (error) {
      console.error("Jobs full-window hydration failed.", error);
      setFullWindowHydrationError(
        error instanceof Error
          ? error.message
          : "The expanded jobs search could not be loaded right now.",
      );
    } finally {
      fullWindowHydrationInFlight.current = false;
      setIsHydratingFullWindow(false);
    }
  }

  useEffect(() => {
    if (!canHydrateFullWindow || isHydratingFullWindow) {
      return;
    }

    const timer = window.setTimeout(() => {
      void hydrateFullJobsWindow(fullJobsWindowLimit);
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [canHydrateFullWindow, fullJobsWindowLimit, isHydratingFullWindow]);

  useEffect(() => {
    if (
      !(hasManualFilters || (usaOnlyFilter && filteredJobs.length === 0)) ||
      !canHydrateFullWindow ||
      isHydratingFullWindow
    ) {
      return;
    }

    void hydrateFullJobsWindow(fullJobsWindowLimit);
  }, [
    canHydrateFullWindow,
    filteredJobs.length,
    fullJobsWindowLimit,
    hasManualFilters,
    isHydratingFullWindow,
    usaOnlyFilter,
  ]);

  async function handleLoadMore() {
    if (canRevealLoadedJobs) {
      setVisibleCount((current) => Math.min(current + loadMoreCount, filteredJobs.length));
      return;
    }

    if (!hasMoreAvailable || isLoadingMore || isHydratingFullWindow) {
      return;
    }

    const nextLimit = loadedJobs.length + loadMoreCount;

    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const snapshot = await fetchJobsWindow(nextLimit);
      const hydratedFullWindow = didHydrateFullJobsWindow(snapshot, nextLimit);

      applySnapshot(snapshot, {
        hasHydratedFullWindow: hydratedFullWindow,
        hasMoreAvailable: !hydratedFullWindow,
      });
      setVisibleCount((current) =>
        Math.min(Math.max(current, loadedJobs.length) + loadMoreCount, snapshot.jobs.length),
      );
    } catch (error) {
      setLoadMoreError(
        error instanceof Error ? error.message : "More jobs could not be loaded right now.",
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div className={styles.jobsResults}>
      {activeSurface === "jobs" ? (
        <>
          <section className={styles.filterPanel}>
        <div className={styles.searchField}>
          <Search aria-hidden="true" size={18} strokeWidth={2} />
          <input
            aria-label="Keyword"
            className={styles.searchInput}
            onChange={(event) => {
              setKeyword(event.target.value);
            }}
            placeholder="software engineer, AI, remote, gaming, LLM..."
            type="search"
            value={keyword}
          />
        </div>

        <div className={styles.filterRow}>
          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Role type</span>
            <span className={styles.filterSelectShell}>
              <select
                aria-label="Role type"
                className={styles.filterSelect}
                onChange={(event) => {
                  setRoleTypeFilter(event.target.value as "all" | RoleTypeFilter);
                }}
                value={roleTypeFilter}
              >
                <option value="all">All role types</option>
                {ROLE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatRoleTypeLabel(option)}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className={styles.filterSelectIcon} size={16} strokeWidth={2} />
            </span>
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Date posted</span>
            <span className={styles.filterSelectShell}>
              <select
                aria-label="Date posted"
                className={styles.filterSelect}
                onChange={(event) => {
                  setDateFilter(event.target.value as DateFilter);
                }}
                value={dateFilter}
              >
                <option value="all">Any time</option>
                <option value="1d">Past 24 hours</option>
                <option value="7d">Past 7 days</option>
                <option value="30d">Past 30 days</option>
              </select>
              <ChevronDown aria-hidden="true" className={styles.filterSelectIcon} size={16} strokeWidth={2} />
            </span>
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Workplace</span>
            <span className={styles.filterSelectShell}>
              <select
                aria-label="Workplace"
                className={styles.filterSelect}
                onChange={(event) => {
                  setWorkplaceFilter(event.target.value as WorkplaceFilter);
                }}
                value={workplaceFilter}
              >
                <option value="all">Any workplace</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
              <ChevronDown aria-hidden="true" className={styles.filterSelectIcon} size={16} strokeWidth={2} />
            </span>
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Salary range</span>
            <span className={styles.filterSelectShell}>
              <select
                aria-label="Salary range"
                className={styles.filterSelect}
                onChange={(event) => {
                  setSalaryRangeFilter(event.target.value as SalaryRangeFilter);
                }}
                value={salaryRangeFilter}
              >
                <option value="all">Any salary</option>
                {SALARY_RANGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatSalaryRangeLabel(option)}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className={styles.filterSelectIcon} size={16} strokeWidth={2} />
            </span>
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Company</span>
            <span className={styles.filterSelectShell}>
              <select
                aria-label="Company"
                className={styles.filterSelect}
                onChange={(event) => {
                  setCompanyFilter(event.target.value);
                }}
                value={companyFilter}
              >
                <option value="all">All companies</option>
                {companyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className={styles.filterSelectIcon} size={16} strokeWidth={2} />
            </span>
          </label>
        </div>

        <div className={styles.filterActions}>
          <label className={styles.countryToggle}>
            <input
              checked={usaOnlyFilter}
              className={styles.countryToggleInput}
              onChange={(event) => {
                setUsaOnlyFilter(event.target.checked);
              }}
              type="checkbox"
            />
            <span className={styles.countryToggleCopy}>
              <strong>USA only</strong>
              <span>On by default for new visitors. Turn it off to browse global roles.</span>
            </span>
          </label>

          {showClearFiltersButton ? (
            <button
              className={styles.clearFiltersButton}
              onClick={() => {
                clearAllFilters();
              }}
              type="button"
            >
              Clear filters
            </button>
          ) : null}

          <p className={styles.filterHint}>
            {isLoadingCompanyResults
              ? `Loading all ${companyFilter} roles directly from the jobs snapshot.`
              : companyScopeError
                ? companyScopeError
              : companyFilter !== "all"
                ? `Showing all ${formatCount(activeTotalAvailableCount)} ${companyFilter} jobs available in the snapshot.`
              : isSearchingAllJobs
                  ? `Checking all ${formatCount(activeTotalAvailableCount)} available jobs so filters can match beyond the first ${formatCount(loadedJobs.length)} roles.`
                  : isSearchingSalaryMatches
                    ? `Checking salary details across ${formatCount(jobsMatchingNonSalaryFilters.length)} filtered ${pluralize(jobsMatchingNonSalaryFilters.length, "role")} so pay range matches can surface even when the saved snapshot is missing compensation metadata.`
                  : hasManualFilters
                    ? `Filters automatically expand to all ${formatCount(activeTotalAvailableCount)} available jobs in the saved snapshot.`
                    : usaOnlyFilter
                      ? "USA only is active by default. Turn it off to browse global roles."
                      : `Global browsing is active. Filters automatically expand to all ${formatCount(activeTotalAvailableCount)} available jobs in the saved snapshot.`}
          </p>
        </div>
      </section>

          <div className={styles.resultsHeader}>
            <p className={styles.resultsSummary}>
              {isLoadingCompanyResults
                ? `Loading ${companyFilter} roles...`
                : isSearchingAllJobs
                ? `Checking all ${formatCount(activeTotalAvailableCount)} available jobs for matches...`
                : isSearchingSalaryMatches
                  ? `Checking salary details across ${formatCount(jobsMatchingNonSalaryFilters.length)} filtered ${pluralize(jobsMatchingNonSalaryFilters.length, "role")}...`
                : `Showing ${visibleJobs.length} of ${filteredJobs.length} matching ${pluralize(filteredJobs.length, "role")} from ${activeJobs.length} loaded.`}
            </p>
            <div className={styles.resultsHeaderActions}>
              <button
                className={styles.recruiterViewButton}
                onClick={() => {
                  setActiveSurface("recruiters");
                }}
                type="button"
              >
                Find Recruiters
              </button>
              <p className={styles.resultsTotal}>{resultsTotalLabel}</p>
            </div>
          </div>

      {filteredJobs.length > 0 ? (
        <div className={styles.jobsGrid}>
          {visibleJobs.map((job) => {
            const displayLocation = sanitizeJobLocationText(job.location);
            const salaryText = formatSalaryTextForRail(job.salaryText);
            const jobMeta = [displayLocation, job.department, job.commitment].filter(Boolean).join(" • ");
            const schemaFamily = resolveSchemaFamilyForJob(job);
            const applyLabel = getJobApplyActionLabel(job.applyTarget);
            const skipProfileGate = !isAutonomousApplySupportedTarget(job.applyTarget);

            return (
              <article className={styles.jobCard} key={job.id}>
                <div className={styles.jobCopy}>
                  <div>
                    <span className={styles.cardEyebrow}>{job.companyName}</span>
                    <h3>{job.title}</h3>
                  </div>
                  {jobMeta ? <p className={styles.jobMeta}>{jobMeta}</p> : null}
                  {salaryText ? (
                    <div className={styles.jobMetaRow}>
                      <span className={styles.jobMetaPill}>{salaryText}</span>
                    </div>
                  ) : null}
                </div>
                <div className={styles.jobFooter}>
                  <span>Updated {formatTimestamp(job.updatedAt || job.postedAt)}</span>
                </div>
                <div className={styles.jobActions}>
                  <ProfileCompletionGuard
                    applyUrl={job.applyUrl}
                    buttonLabel={applyLabel}
                    buttonVariant="jobs-card"
                    className={styles.jobLink}
                    companyName={job.companyName}
                    jobTitle={job.title}
                    resolveApplyUrl={() => handleApplyJob(job)}
                    schemaFamily={schemaFamily}
                    skipProfileGate={skipProfileGate}
                  />
                  <JobDetailsTrigger
                    applyAction={
                      <ProfileCompletionGuard
                        applyUrl={job.applyUrl}
                        buttonLabel={applyLabel}
                        buttonVariant="jobs-card"
                        companyName={job.companyName}
                        jobTitle={job.title}
                        resolveApplyUrl={() => handleApplyJob(job)}
                        schemaFamily={schemaFamily}
                        skipProfileGate={skipProfileGate}
                      />
                    }
                    buttonClassName={styles.jobDetailsButton}
                    buttonLabel="View details"
                    preview={createJobDetailsPreview(job)}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : isLoadingCompanyResults ? (
        <article className={styles.noResultsState}>
          <p className={styles.filterEyebrow}>Loading company roles</p>
          <h3>Loading all {companyFilter} jobs from the snapshot.</h3>
          <p>
            Career AI is pulling the current {companyFilter} roles directly so the company filter
            can return results without waiting for the full jobs catalog to hydrate.
          </p>
          <button
            className={styles.clearFiltersButton}
            onClick={() => {
              clearAllFilters();
            }}
            type="button"
          >
            Clear filters
          </button>
        </article>
      ) : companyScopeError ? (
        <article className={styles.noResultsState}>
          <p className={styles.filterEyebrow}>Company filter issue</p>
          <h3>{companyFilter} jobs could not be loaded right now.</h3>
          <p>
            The company-specific request failed before results came back. Clear the filter or try
            again in a moment.
          </p>
          <button
            className={styles.clearFiltersButton}
            onClick={() => {
              clearAllFilters();
            }}
            type="button"
          >
            Clear filters
          </button>
        </article>
      ) : fullWindowHydrationError ? (
        <article className={styles.noResultsState}>
          <p className={styles.filterEyebrow}>Expanded search unavailable</p>
          <h3>The full jobs catalog could not be expanded right now.</h3>
          <p>
            Career AI could not load the larger jobs snapshot for this filter yet. Retry the
            expanded search or clear filters to go back to the current loaded window.
          </p>
          <button
            className={styles.clearFiltersButton}
            onClick={() => {
              setFullWindowHydrationError(null);
              void hydrateFullJobsWindow(fullJobsWindowLimit);
            }}
            type="button"
          >
            Retry search all jobs
          </button>
        </article>
      ) : isSearchingAllJobs ? (
        <article className={styles.noResultsState}>
          <p className={styles.filterEyebrow}>Searching all jobs</p>
          <h3>Checking all {formatCount(activeTotalAvailableCount)} available jobs for matches.</h3>
          <p>
            The first {formatCount(loadedJobs.length)} roles loaded instantly. Career AI is
            expanding the rest of the jobs snapshot in the background so your filters can search
            the full jobs pool.
          </p>
          <button
            className={styles.clearFiltersButton}
            onClick={() => {
              clearAllFilters();
            }}
            type="button"
          >
            Clear filters
          </button>
        </article>
      ) : isSearchingSalaryMatches ? (
        <article className={styles.noResultsState}>
          <p className={styles.filterEyebrow}>Checking salary details</p>
          <h3>Checking salary details for matching roles.</h3>
          <p>
            Career AI is filling in missing compensation data across the filtered jobs so this pay
            range can finish evaluating the loaded matches.
          </p>
          <button
            className={styles.clearFiltersButton}
            onClick={() => {
              clearAllFilters();
            }}
            type="button"
          >
            Clear filters
          </button>
        </article>
      ) : (
        <article className={styles.noResultsState}>
          <p className={styles.filterEyebrow}>No matches</p>
          <h3>No roles match the current filters.</h3>
          <p>
            Try a broader keyword, remove a manual filter, or clear everything to return to the
            full jobs window.
          </p>
          <button
            className={styles.clearFiltersButton}
            onClick={() => {
              clearAllFilters();
            }}
            type="button"
          >
            Clear filters
          </button>
        </article>
      )}

          {filteredJobs.length > 0 && showLoadMore ? (
            <div className={styles.loadMoreRow}>
              <button
                className={styles.loadMoreButton}
                disabled={isLoadingMore}
                onClick={() => {
                  void handleLoadMore();
                }}
                type="button"
              >
                {isLoadingMore ? "Loading..." : "More..."}
              </button>
              {loadMoreError ? <p className={styles.loadMoreNote}>{loadMoreError}</p> : null}
            </div>
          ) : null}
        </>
      ) : (
        <section className={styles.recruiterTakeoverSurface}>
          <div className={styles.recruiterTakeoverHeader}>
            <p className={styles.recruiterTakeoverCopy}>
              Browse recruiter-owned listings and recommendations in one permissioned workspace.
            </p>
            <button
              className={styles.recruiterViewButton}
              onClick={() => {
                setActiveSurface("jobs");
              }}
              type="button"
            >
              Back to Jobs
            </button>
          </div>
          <RecruiterMarketplacePanel />
        </section>
      )}
    </div>
  );
}
