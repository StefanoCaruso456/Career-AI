"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import {
  jobsFeedResponseSchema,
  type JobPostingDto,
  type JobSourceSnapshotDto,
} from "@/packages/contracts/src";
import styles from "./page.module.css";

type JobsResultsProps = {
  jobs: JobPostingDto[];
  initialCount?: number;
  initialRequestLimit?: number;
  initialTotalAvailableCount?: number;
  loadMoreCount?: number;
};

type WorkplaceFilter = "all" | "remote" | "hybrid" | "onsite";
type DateFilter = "all" | "1d" | "7d" | "30d";
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
      "ux designer",
      "ui designer",
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

function formatQualityLabel(value: "high_signal" | "coverage") {
  return value === "high_signal" ? "High-signal" : "Coverage";
}

function formatRoleTypeLabel(value: RoleTypeFilter) {
  return ROLE_TYPE_LABELS[value];
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getTotalAvailableCount(sources: JobSourceSnapshotDto[]) {
  return sources
    .filter((source) => source.status === "connected")
    .reduce((sum, source) => sum + source.jobCount, 0);
}

function normalizeCommitment(value: string | null) {
  if (!value) {
    return "unknown";
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.includes("full")) {
    return "full-time";
  }

  if (normalized.includes("part")) {
    return "part-time";
  }

  if (normalized.includes("contract")) {
    return "contract";
  }

  if (normalized.includes("intern")) {
    return "internship";
  }

  if (normalized.includes("temp")) {
    return "temporary";
  }

  return normalized.replace(/\s+/g, "-");
}

function formatCommitmentLabel(value: string) {
  return value
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
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
  const searchText = [job.normalizedTitle, job.title, job.department]
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
  initialCount = 24,
  initialRequestLimit = Number.MAX_SAFE_INTEGER,
  initialTotalAvailableCount = jobs.length,
  loadMoreCount = 29,
}: JobsResultsProps) {
  const [loadedJobs, setLoadedJobs] = useState(jobs);
  const [totalAvailableCount, setTotalAvailableCount] = useState(initialTotalAvailableCount);
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());
  const [roleTypeFilter, setRoleTypeFilter] = useState<"all" | RoleTypeFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [workplaceFilter, setWorkplaceFilter] = useState<WorkplaceFilter>("all");
  const [commitmentFilter, setCommitmentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, jobs.length));
  const [hasMoreAvailable, setHasMoreAvailable] = useState(jobs.length >= initialRequestLimit);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const companyOptions = Array.from(new Set(loadedJobs.map((job) => job.companyName))).sort(
    (left, right) => left.localeCompare(right),
  );
  const commitmentOptions = Array.from(
    new Set(
      loadedJobs
        .map((job) => normalizeCommitment(job.commitment))
        .filter((value) => value !== "unknown"),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const filteredJobs = loadedJobs.filter((job) => {
    const matchesRoleType = roleTypeFilter === "all" || inferRoleType(job) === roleTypeFilter;
    const matchesCompany = companyFilter === "all" || job.companyName === companyFilter;
    const matchesWorkplace =
      workplaceFilter === "all" || inferWorkplaceMode(job.location) === workplaceFilter;
    const matchesCommitment =
      commitmentFilter === "all" || normalizeCommitment(job.commitment) === commitmentFilter;

    return (
      matchesRoleType &&
      matchesCompany &&
      matchesWorkplace &&
      matchesCommitment &&
      matchesRecencyFilter(job, dateFilter) &&
      matchesKeyword(job, deferredKeyword)
    );
  });
  const visibleJobs = filteredJobs.slice(0, visibleCount);
  const remainingCount = Math.max(filteredJobs.length - visibleCount, 0);
  const canRevealLoadedJobs = remainingCount > 0;
  const hasActiveFilters =
    keyword.length > 0 ||
    roleTypeFilter !== "all" ||
    companyFilter !== "all" ||
    workplaceFilter !== "all" ||
    commitmentFilter !== "all" ||
    dateFilter !== "all";
  const showLoadMore = canRevealLoadedJobs || hasMoreAvailable;

  useEffect(() => {
    setVisibleCount(Math.min(initialCount, filteredJobs.length || initialCount));
  }, [
    companyFilter,
    commitmentFilter,
    dateFilter,
    deferredKeyword,
    initialCount,
    roleTypeFilter,
    workplaceFilter,
  ]);

  useEffect(() => {
    setLoadedJobs(jobs);
    setHasMoreAvailable(jobs.length >= initialRequestLimit);
    setLoadMoreError(null);
    setTotalAvailableCount(initialTotalAvailableCount);
    setVisibleCount(Math.min(initialCount, jobs.length));
  }, [initialRequestLimit, initialTotalAvailableCount, jobs]);

  async function handleLoadMore() {
    if (canRevealLoadedJobs) {
      setVisibleCount((current) => Math.min(current + loadMoreCount, filteredJobs.length));
      return;
    }

    if (!hasMoreAvailable || isLoadingMore) {
      return;
    }

    const nextLimit = loadedJobs.length + loadMoreCount;

    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const response = await fetch(`/api/v1/jobs?limit=${nextLimit}`, {
        cache: "no-store",
        method: "GET",
      });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(payload.error || payload.message || "More jobs could not be loaded right now.");
      }

      const snapshot = jobsFeedResponseSchema.parse(payload);

      setLoadedJobs(snapshot.jobs);
      setTotalAvailableCount(getTotalAvailableCount(snapshot.sources));
      setVisibleCount((current) => Math.min(Math.max(current, loadedJobs.length) + loadMoreCount, snapshot.jobs.length));
      setHasMoreAvailable(snapshot.jobs.length >= nextLimit);
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
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Date posted</span>
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
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Workplace</span>
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
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Employment type</span>
            <select
              aria-label="Employment type"
              className={styles.filterSelect}
              onChange={(event) => {
                setCommitmentFilter(event.target.value);
              }}
              value={commitmentFilter}
            >
              <option value="all">Any type</option>
              {commitmentOptions.map((option) => (
                <option key={option} value={option}>
                  {formatCommitmentLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.filterControl}>
            <span className={styles.filterLabel}>Company</span>
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
          </label>
        </div>

        {hasActiveFilters ? (
          <div className={styles.filterActions}>
            <button
              className={styles.clearFiltersButton}
              onClick={() => {
                setKeyword("");
                setRoleTypeFilter("all");
                setCompanyFilter("all");
                setWorkplaceFilter("all");
                setCommitmentFilter("all");
                setDateFilter("all");
              }}
              type="button"
            >
              Clear filters
            </button>
            <p className={styles.filterHint}>
              Manual filters only affect the currently loaded jobs window.
            </p>
          </div>
        ) : null}
      </section>

      <div className={styles.resultsHeader}>
        <p className={styles.resultsSummary}>
          Showing {visibleJobs.length} of {filteredJobs.length} matching{" "}
          {pluralize(filteredJobs.length, "role")} from {loadedJobs.length} loaded.
        </p>
        <p className={styles.resultsTotal}>
          {formatCount(totalAvailableCount)} jobs available
        </p>
      </div>

      {filteredJobs.length > 0 ? (
        <div className={styles.jobsGrid}>
          {visibleJobs.map((job) => (
            <article className={styles.jobCard} key={job.id}>
              <div className={styles.badgeRow}>
                <span className={styles.qualityBadge}>{formatQualityLabel(job.sourceQuality)}</span>
              </div>
              <div className={styles.jobCopy}>
                <div>
                  <span className={styles.cardEyebrow}>{job.companyName}</span>
                  <h3>{job.title}</h3>
                </div>
                <p className={styles.jobMeta}>
                  {[job.location, job.department, job.commitment].filter(Boolean).join(" • ") ||
                    "Details are still coming in from the source."}
                </p>
              </div>
              <div className={styles.jobFooter}>
                <span>Updated {formatTimestamp(job.updatedAt || job.postedAt)}</span>
              </div>
              <a className={styles.jobLink} href={job.applyUrl} rel="noreferrer" target="_blank">
                Open posting
                <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
              </a>
            </article>
          ))}
        </div>
      ) : (
        <article className={styles.noResultsState}>
          <p className={styles.filterEyebrow}>No matches</p>
          <h3>No roles match the current filters.</h3>
          <p>
            Try a broader keyword, remove a manual filter, or clear everything to return to the
            full loaded jobs window.
          </p>
          <button
            className={styles.clearFiltersButton}
            onClick={() => {
              setKeyword("");
              setRoleTypeFilter("all");
              setCompanyFilter("all");
              setWorkplaceFilter("all");
              setCommitmentFilter("all");
              setDateFilter("all");
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
