"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import type { JobPostingDto } from "@/packages/contracts/src";
import styles from "./page.module.css";

type JobsResultsProps = {
  jobs: JobPostingDto[];
  initialCount?: number;
  loadMoreCount?: number;
};

type SourceFilter = "all" | "ats_direct" | "aggregator";
type WorkplaceFilter = "all" | "remote" | "hybrid" | "onsite";
type DateFilter = "all" | "1d" | "7d" | "30d";

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

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
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

export function JobsResults({
  jobs,
  initialCount = 24,
  loadMoreCount = 29,
}: JobsResultsProps) {
  const [keyword, setKeyword] = useState("");
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [workplaceFilter, setWorkplaceFilter] = useState<WorkplaceFilter>("all");
  const [commitmentFilter, setCommitmentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, jobs.length));
  const companyOptions = Array.from(new Set(jobs.map((job) => job.companyName))).sort((left, right) =>
    left.localeCompare(right),
  );
  const commitmentOptions = Array.from(
    new Set(
      jobs
        .map((job) => normalizeCommitment(job.commitment))
        .filter((value) => value !== "unknown"),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const filteredJobs = jobs.filter((job) => {
    const matchesSource = sourceFilter === "all" || job.sourceLane === sourceFilter;
    const matchesCompany = companyFilter === "all" || job.companyName === companyFilter;
    const matchesWorkplace =
      workplaceFilter === "all" || inferWorkplaceMode(job.location) === workplaceFilter;
    const matchesCommitment =
      commitmentFilter === "all" || normalizeCommitment(job.commitment) === commitmentFilter;

    return (
      matchesSource &&
      matchesCompany &&
      matchesWorkplace &&
      matchesCommitment &&
      matchesRecencyFilter(job, dateFilter) &&
      matchesKeyword(job, deferredKeyword)
    );
  });
  const visibleJobs = filteredJobs.slice(0, visibleCount);
  const remainingCount = Math.max(filteredJobs.length - visibleCount, 0);
  const nextRevealCount = Math.min(loadMoreCount, remainingCount);
  const hasActiveFilters =
    keyword.length > 0 ||
    sourceFilter !== "all" ||
    companyFilter !== "all" ||
    workplaceFilter !== "all" ||
    commitmentFilter !== "all" ||
    dateFilter !== "all";

  useEffect(() => {
    setVisibleCount(Math.min(initialCount, filteredJobs.length || initialCount));
  }, [
    companyFilter,
    commitmentFilter,
    dateFilter,
    deferredKeyword,
    filteredJobs.length,
    initialCount,
    sourceFilter,
    workplaceFilter,
  ]);

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
            <span className={styles.filterLabel}>Source</span>
            <select
              aria-label="Source"
              className={styles.filterSelect}
              onChange={(event) => {
                setSourceFilter(event.target.value as SourceFilter);
              }}
              value={sourceFilter}
            >
              <option value="all">All sources</option>
              <option value="ats_direct">ATS direct</option>
              <option value="aggregator">Coverage</option>
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
                setSourceFilter("all");
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
          {pluralize(filteredJobs.length, "role")} from {jobs.length} loaded.
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
              setSourceFilter("all");
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

      {filteredJobs.length > 0 && remainingCount > 0 ? (
        <div className={styles.loadMoreRow}>
          <button
            className={styles.loadMoreButton}
            onClick={() => {
              setVisibleCount((current) => Math.min(current + loadMoreCount, jobs.length));
            }}
            type="button"
          >
            More...
          </button>
          <p className={styles.loadMoreNote}>
            Reveal {nextRevealCount} more {pluralize(nextRevealCount, "role")}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
