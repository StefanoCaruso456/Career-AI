"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ProfileCompletionGuard } from "@/components/easy-apply-profile/profile-completion-guard";
import { fetchJobDetails } from "@/components/jobs/job-details-client";
import { JobDetailsTrigger } from "@/components/jobs/job-details-trigger";
import {
  formatSalaryTextForRail,
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
  annualizeSalaryRange,
  parseSalaryText,
} from "@/packages/jobs-domain/src/job-search-retrieval/utils";
import styles from "./page.module.css";

type JobsResultsProps = {
  jobs: JobPostingDto[];
  initialCompanyOptions?: string[];
  initialCount?: number;
  initialLastSyncAt?: string | null;
  initialRequestLimit?: number;
  initialSources?: JobSourceSnapshotDto[];
  initialStorageMode?: "database" | "ephemeral";
  initialTotalAvailableCount?: number;
  loadMoreCount?: number;
};

type WorkplaceFilter = "all" | "remote" | "hybrid" | "onsite";
type DateFilter = "all" | "1d" | "7d" | "30d";
const SALARY_RANGE_OPTIONS = [
  "under-100k",
  "100k-150k",
  "150k-200k",
  "200k-250k",
  "250k-plus",
] as const;
type SalaryRangeFilter = "all" | (typeof SALARY_RANGE_OPTIONS)[number];
const EMPTY_COMPANY_OPTIONS: string[] = [];
const EMPTY_SOURCE_SNAPSHOTS: JobSourceSnapshotDto[] = [];
const STALE_SNAPSHOT_MS = 10 * 60 * 1000;
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

function hasOwnSalaryOverride(
  record: Record<string, string | null>,
  jobId: string,
) {
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

function isSnapshotStale(
  storageMode: JobsResultsProps["initialStorageMode"],
  lastSyncAt: string | null | undefined,
) {
  if (storageMode !== "database") {
    return false;
  }

  if (!lastSyncAt) {
    return true;
  }

  const timestamp = Date.parse(lastSyncAt);

  if (Number.isNaN(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > STALE_SNAPSHOT_MS;
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

function inferAnnualSalary(job: JobPostingDto) {
  const salaryText = job.salaryText ?? job.salaryRange?.rawText ?? null;

  if (!salaryText) {
    return null;
  }

  const salaryRange = annualizeSalaryRange(parseSalaryText(salaryText));
  const parsedValues = [salaryRange.min, salaryRange.max].filter(
    (value): value is number => value !== null,
  );

  if (parsedValues.length === 0) {
    return null;
  }

  const representativeValue =
    parsedValues.length === 1 ? parsedValues[0] : (parsedValues[0] + parsedValues[1]) / 2;

  return representativeValue;
}

function matchesSalaryRange(job: JobPostingDto, salaryRangeFilter: SalaryRangeFilter) {
  if (salaryRangeFilter === "all") {
    return true;
  }

  const annualSalary = inferAnnualSalary(job);

  if (annualSalary === null) {
    return false;
  }

  if (salaryRangeFilter === "under-100k") {
    return annualSalary < 100_000;
  }

  if (salaryRangeFilter === "100k-150k") {
    return annualSalary >= 100_000 && annualSalary < 150_000;
  }

  if (salaryRangeFilter === "150k-200k") {
    return annualSalary >= 150_000 && annualSalary < 200_000;
  }

  if (salaryRangeFilter === "200k-250k") {
    return annualSalary >= 200_000 && annualSalary < 250_000;
  }

  return annualSalary >= 250_000;
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
  initialLastSyncAt = null,
  initialRequestLimit = Number.MAX_SAFE_INTEGER,
  initialSources = EMPTY_SOURCE_SNAPSHOTS,
  initialStorageMode = "ephemeral",
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
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());
  const [roleTypeFilter, setRoleTypeFilter] = useState<"all" | RoleTypeFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [workplaceFilter, setWorkplaceFilter] = useState<WorkplaceFilter>("all");
  const [salaryRangeFilter, setSalaryRangeFilter] = useState<SalaryRangeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, jobs.length));
  const [hasMoreAvailable, setHasMoreAvailable] = useState(jobs.length >= initialRequestLimit);
  const [hasHydratedFullWindow, setHasHydratedFullWindow] = useState(
    () =>
      initialRequestLimit === Number.MAX_SAFE_INTEGER || initialTotalAvailableCount <= jobs.length,
  );
  const [needsFreshSnapshot, setNeedsFreshSnapshot] = useState(() =>
    isSnapshotStale(initialStorageMode, initialLastSyncAt),
  );
  const [isHydratingFullWindow, setIsHydratingFullWindow] = useState(false);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [snapshotRefreshError, setSnapshotRefreshError] = useState<string | null>(null);
  const [fullWindowHydrationError, setFullWindowHydrationError] = useState<string | null>(null);
  const fullWindowHydrationInFlight = useRef(false);
  const snapshotRefreshInFlight = useRef(false);
  const companyScopeRequestSequence = useRef(0);
  const salaryHydrationInFlight = useRef(new Set<string>());
  const companyScopedExpectedCount = getCompanyAvailableCount(sourceSnapshots, companyFilter);
  const companyScopeKey = companyFilter === "all" ? null : companyFilter;
  const activeJobs = companyFilter === "all" ? loadedJobs : (companyScopedSnapshot?.jobs ?? []);
  const resolvedActiveJobs = activeJobs.map((job) =>
    hasOwnSalaryOverride(salaryOverrides, job.id)
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
    const matchesWorkplace =
      workplaceFilter === "all" || inferWorkplaceMode(job.location) === workplaceFilter;

    return (
      matchesRoleType &&
      matchesCompany &&
      matchesWorkplace &&
      matchesRecencyFilter(job, dateFilter) &&
      matchesKeyword(job, deferredKeyword)
    );
  });
  const filteredJobs = jobsMatchingNonSalaryFilters.filter((job) =>
    matchesSalaryRange(job, salaryRangeFilter),
  );
  const visibleJobs = filteredJobs.slice(0, visibleCount);
  const salaryHydrationPool =
    salaryRangeFilter !== "all" && filteredJobs.length === 0
      ? jobsMatchingNonSalaryFilters.slice(0, Math.max(initialCount * 2, 48))
      : visibleJobs;
  const remainingCount = Math.max(filteredJobs.length - visibleCount, 0);
  const canRevealLoadedJobs = remainingCount > 0;
  const hasActiveFilters =
    keyword.length > 0 ||
    roleTypeFilter !== "all" ||
    companyFilter !== "all" ||
    workplaceFilter !== "all" ||
    salaryRangeFilter !== "all" ||
    dateFilter !== "all";
  const canHydrateFullWindow =
    companyFilter === "all" &&
    initialRequestLimit !== Number.MAX_SAFE_INTEGER &&
    !hasHydratedFullWindow &&
    !fullWindowHydrationError &&
    fullJobsWindowLimit > loadedJobs.length;
  const isSearchingAllJobs =
    companyFilter === "all" &&
    hasActiveFilters &&
    filteredJobs.length === 0 &&
    (canHydrateFullWindow || isHydratingFullWindow);
  const isLoadingCompanyResults = companyFilter !== "all" && isLoadingCompanyScope;
  const showLoadMore =
    companyFilter === "all" ? canRevealLoadedJobs || hasMoreAvailable : canRevealLoadedJobs;

  function clearAllFilters() {
    setKeyword("");
    setRoleTypeFilter("all");
    setCompanyFilter("all");
    setWorkplaceFilter("all");
    setSalaryRangeFilter("all");
    setDateFilter("all");
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
    setHasMoreAvailable(jobs.length >= initialRequestLimit);
    setHasHydratedFullWindow(
      initialRequestLimit === Number.MAX_SAFE_INTEGER || initialTotalAvailableCount <= jobs.length,
    );
    setNeedsFreshSnapshot(isSnapshotStale(initialStorageMode, initialLastSyncAt));
    setIsHydratingFullWindow(false);
    setIsRefreshingSnapshot(false);
    setSnapshotRefreshError(null);
    setFullWindowHydrationError(null);
    fullWindowHydrationInFlight.current = false;
    snapshotRefreshInFlight.current = false;
    companyScopeRequestSequence.current += 1;
    salaryHydrationInFlight.current.clear();
    setLoadMoreError(null);
    setTotalAvailableCount(initialTotalAvailableCount);
    setVisibleCount(Math.min(initialCount, jobs.length));
  }, [
    initialCompanyOptions,
    initialLastSyncAt,
    initialRequestLimit,
    initialSources,
    initialStorageMode,
    initialTotalAvailableCount,
    jobs,
  ]);

  async function fetchJobsWindow(limit: number, options?: { company?: string; refresh?: boolean }) {
    const searchParams = new URLSearchParams({
      limit: String(limit),
    });

    if (options?.company) {
      searchParams.set("company", options.company);
    }

    if (options?.refresh) {
      searchParams.set("refresh", "1");
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
      refresh: needsFreshSnapshot,
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
    needsFreshSnapshot,
  ]);

  useEffect(() => {
    const jobsMissingSalary = salaryHydrationPool
      .filter(
        (job) =>
          !job.salaryText &&
          !hasOwnSalaryOverride(salaryOverrides, job.id) &&
          !salaryHydrationInFlight.current.has(job.id),
      )
      .slice(0, 12);

    if (jobsMissingSalary.length === 0) {
      return;
    }

    const controller = new AbortController();

    jobsMissingSalary.forEach((job) => {
      salaryHydrationInFlight.current.add(job.id);
    });

    void (async () => {
      const hydratedSalaries = await Promise.all(
        jobsMissingSalary.map(async (job) => {
          try {
            const details = await fetchJobDetails(createJobDetailsPreview(job), {
              signal: controller.signal,
            });

            return [job.id, details.salaryText ?? null] as const;
          } catch {
            return [job.id, null] as const;
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

        hydratedSalaries.forEach(([jobId, salaryText]) => {
          if (hasOwnSalaryOverride(current, jobId)) {
            return;
          }

          next[jobId] = salaryText;
          changed = true;
        });

        return changed ? next : current;
      });
    })();

    return () => {
      controller.abort();

      jobsMissingSalary.forEach((job) => {
        salaryHydrationInFlight.current.delete(job.id);
      });
    };
  }, [salaryHydrationPool, salaryOverrides]);

  useEffect(() => {
    if (!needsFreshSnapshot || snapshotRefreshInFlight.current) {
      return;
    }

    let isCancelled = false;
    const refreshLimit = Math.max(initialRequestLimit, loadedJobs.length);

    snapshotRefreshInFlight.current = true;
    setIsRefreshingSnapshot(true);
    setSnapshotRefreshError(null);

    void fetchJobsWindow(refreshLimit, { refresh: true })
      .then(async (snapshot) => {
        if (isCancelled) {
          return;
        }

        let hydratedFullWindow = didHydrateFullJobsWindow(snapshot, refreshLimit);

        applySnapshot(snapshot, {
          hasHydratedFullWindow: hydratedFullWindow,
          hasMoreAvailable: !hydratedFullWindow,
        });

        if (!hydratedFullWindow) {
          const expandedLimit = Math.max(getTotalAvailableCount(snapshot.sources), snapshot.jobs.length);
          const expandedSnapshot = await fetchJobsWindow(expandedLimit);

          if (isCancelled) {
            return;
          }

          hydratedFullWindow = didHydrateFullJobsWindow(expandedSnapshot, expandedLimit);

          applySnapshot(expandedSnapshot, {
            hasHydratedFullWindow: hydratedFullWindow,
            hasMoreAvailable: !hydratedFullWindow,
          });
        }

        setNeedsFreshSnapshot(false);
      })
      .catch((error) => {
        console.error("Jobs snapshot refresh failed.", error);
        setSnapshotRefreshError(
          error instanceof Error
            ? error.message
            : "The latest jobs snapshot could not be refreshed right now.",
        );
        setNeedsFreshSnapshot(false);
      })
      .finally(() => {
        snapshotRefreshInFlight.current = false;

        if (isCancelled) {
          return;
        }

        setIsRefreshingSnapshot(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [initialRequestLimit, loadedJobs.length, needsFreshSnapshot]);

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
    if (!hasActiveFilters || !canHydrateFullWindow || isHydratingFullWindow) {
      return;
    }

    void hydrateFullJobsWindow(fullJobsWindowLimit);
  }, [
    canHydrateFullWindow,
    fullJobsWindowLimit,
    hasActiveFilters,
    isHydratingFullWindow,
  ]);

  async function handleLoadMore() {
    if (canRevealLoadedJobs) {
      setVisibleCount((current) => Math.min(current + loadMoreCount, filteredJobs.length));
      return;
    }

    if (!hasMoreAvailable || isLoadingMore || isHydratingFullWindow || isRefreshingSnapshot) {
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
      <section className={styles.filterPanel}>
        <div className={styles.searchField}>
          <Search aria-hidden="true" size={18} strokeWidth={2} />
          <input
            aria-label="Keyword"
            className={styles.searchInput}
            onChange={(event) => {
              setKeyword(event.target.value);
            }}
            placeholder="Keyword: software engineer, AI, remote, gaming, LLM..."
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

        {hasActiveFilters ? (
          <div className={styles.filterActions}>
            <button
              className={styles.clearFiltersButton}
              onClick={() => {
                clearAllFilters();
              }}
              type="button"
            >
              Clear filters
            </button>
            <p className={styles.filterHint}>
              {isLoadingCompanyResults
                ? `Loading all ${companyFilter} roles directly from the jobs snapshot.`
                : companyScopeError
                  ? companyScopeError
                : companyFilter !== "all"
                  ? `Showing all ${formatCount(activeTotalAvailableCount)} ${companyFilter} jobs available in the snapshot.`
                : isRefreshingSnapshot
                  ? "Refreshing the latest jobs snapshot in the background while filters keep working from the saved catalog."
                  : snapshotRefreshError
                    ? "Using the saved jobs snapshot while the latest source totals are temporarily unavailable."
                  : isSearchingAllJobs
                    ? `Checking all ${formatCount(activeTotalAvailableCount)} available jobs so filters can match beyond the first ${formatCount(loadedJobs.length)} roles.`
                    : `Filters automatically expand to all ${formatCount(activeTotalAvailableCount)} available jobs.`}
            </p>
          </div>
        ) : null}
      </section>

      <div className={styles.resultsHeader}>
        <p className={styles.resultsSummary}>
          {isLoadingCompanyResults
            ? `Loading ${companyFilter} roles...`
            : isSearchingAllJobs
            ? `Checking all ${formatCount(activeTotalAvailableCount)} available jobs for matches...`
            : isRefreshingSnapshot
            ? `Showing ${visibleJobs.length} of ${filteredJobs.length} matching ${pluralize(filteredJobs.length, "role")} from ${activeJobs.length} loaded while the snapshot refreshes...`
            : `Showing ${visibleJobs.length} of ${filteredJobs.length} matching ${pluralize(filteredJobs.length, "role")} from ${activeJobs.length} loaded.`}
        </p>
        <p className={styles.resultsTotal}>
          {formatCount(activeTotalAvailableCount)} jobs available
        </p>
      </div>

      {filteredJobs.length > 0 ? (
        <div className={styles.jobsGrid}>
          {visibleJobs.map((job) => {
            const displayLocation = sanitizeJobLocationText(job.location);
            const salaryText = formatSalaryTextForRail(job.salaryText);
            const jobMeta = [displayLocation, job.department, job.commitment].filter(Boolean).join(" • ");
            const schemaFamily = resolveSchemaFamilyForJob(job);

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
                    buttonLabel="Apply"
                    buttonVariant="jobs-card"
                    className={styles.jobLink}
                    companyName={job.companyName}
                    jobTitle={job.title}
                    schemaFamily={schemaFamily}
                  />
                  <JobDetailsTrigger
                    applyAction={
                      <ProfileCompletionGuard
                        applyUrl={job.applyUrl}
                        buttonLabel="Apply now"
                        buttonVariant="jobs-card"
                        companyName={job.companyName}
                        jobTitle={job.title}
                        schemaFamily={schemaFamily}
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
    </div>
  );
}
