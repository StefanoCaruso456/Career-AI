"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { JobDetailsDto, JobRailFilterOptionsDto } from "@/packages/contracts/src";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import { JobApplyButton } from "@/components/jobs/job-apply-button";
import {
  fetchJobDetails,
  getCachedJobDetails,
} from "@/components/jobs/job-details-client";
import {
  buildJobDetailsPreview,
  DEFAULT_JOB_RAIL_FILTERS,
  EMPLOYMENT_FILTER_LABELS,
  filterAndSortJobsForRail,
  getJobRailOptions,
  POSTED_DATE_LABELS,
  SORT_LABELS,
  SOURCE_FILTER_LABELS,
  WORKPLACE_FILTER_LABELS,
} from "@/components/jobs/job-rail-utils";
import { createFallbackJobDetails, JobDetailsModal } from "./job-details-modal";
import type { JobDetailsPreview } from "./job-details-types";
import { JobListItem } from "./job-list-item";
import styles from "./jobs-side-panel.module.css";

type JobsSidePanelProps = {
  emptyStateMessage?: string | null;
  errorMessage?: string | null;
  filterOptions?: JobRailFilterOptionsDto | null;
  isLoading?: boolean;
  jobs: JobListing[];
  onApply?: (job: JobListing) => Promise<string> | string;
  onClose?: () => void;
};

function getActiveFilterCount(filters: typeof DEFAULT_JOB_RAIL_FILTERS) {
  return [
    filters.company !== "all",
    filters.employmentType !== "all",
    filters.keyword.trim().length > 0,
    filters.location !== "all",
    filters.postedDate !== "any",
    filters.sort !== "relevance",
    filters.source !== "all",
    filters.workplaceType !== "all",
  ].filter(Boolean).length;
}

function restoreRailScroll(container: HTMLDivElement | null, top: number) {
  if (!container) {
    return;
  }

  if (typeof container.scrollTo === "function") {
    container.scrollTo({
      top,
    });
    return;
  }

  container.scrollTop = top;
}

export function JobsSidePanel({
  emptyStateMessage = null,
  errorMessage = null,
  filterOptions = null,
  isLoading = false,
  jobs,
  onApply,
  onClose,
}: JobsSidePanelProps) {
  const [filters, setFilters] = useState(DEFAULT_JOB_RAIL_FILTERS);
  const deferredKeyword = useDeferredValue(filters.keyword.trim().toLowerCase());
  const [activePreview, setActivePreview] = useState<JobDetailsPreview | null>(null);
  const [activeDetails, setActiveDetails] = useState<JobDetailsDto | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [selectedJobKey, setSelectedJobKey] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filtersPopoverRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const railScrollTop = useRef(0);
  const railOptions = getJobRailOptions(jobs, filterOptions);
  const activeFilterCount = getActiveFilterCount(filters);
  const filteredJobs = filterAndSortJobsForRail(jobs, {
    ...filters,
    keyword: deferredKeyword,
  });
  const hasActiveFilters = activeFilterCount > 0;
  const activeJob = selectedJobKey
    ? jobs.find((job) => job.railKey === selectedJobKey) ?? null
    : null;

  useEffect(() => {
    return () => {
      activeController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isFiltersOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (
        filtersRef.current?.contains(target) ||
        filtersPopoverRef.current?.contains(target)
      ) {
        return;
      }

      setIsFiltersOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFiltersOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFiltersOpen]);

  useEffect(() => {
    if (!selectedJobKey) {
      return;
    }

    const nextActiveJob = jobs.find((job) => job.railKey === selectedJobKey);

    if (!nextActiveJob) {
      setActivePreview(null);
      setActiveDetails(null);
      setIsDetailsOpen(false);
      setSelectedJobKey(null);
      return;
    }

    const nextPreview = buildJobDetailsPreview(nextActiveJob);

    setActivePreview(nextPreview);
    setActiveDetails((current) =>
      current && current.id === nextPreview.id ? current : getCachedJobDetails(nextPreview),
    );
  }, [jobs, selectedJobKey]);

  async function loadDetails(preview: JobDetailsPreview, forceRefresh = false) {
    const controller = new AbortController();
    const sequence = requestSequence.current + 1;

    requestSequence.current = sequence;
    activeController.current?.abort();
    activeController.current = controller;
    setIsDetailsLoading(true);

    try {
      const nextDetails = await fetchJobDetails(preview, {
        forceRefresh,
        signal: controller.signal,
      });

      if (requestSequence.current === sequence) {
        setActiveDetails(nextDetails);
      }
    } catch (error) {
      if (controller.signal.aborted || requestSequence.current !== sequence) {
        return;
      }

      const message =
        error instanceof Error ? error.message : "Job details could not be loaded right now.";

      setActiveDetails(createFallbackJobDetails(preview, message));
    } finally {
      if (requestSequence.current === sequence) {
        setIsDetailsLoading(false);
      }
    }
  }

  function openJobDetails(job: JobListing) {
    const preview = buildJobDetailsPreview(job);

    railScrollTop.current = bodyRef.current?.scrollTop ?? 0;
    setSelectedJobKey(job.railKey);
    setActivePreview(preview);
    setActiveDetails(getCachedJobDetails(preview));
    setIsDetailsOpen(true);
    void loadDetails(preview);
  }

  function closeJobDetails() {
    requestSequence.current += 1;
    activeController.current?.abort();
    setIsDetailsLoading(false);
    setIsDetailsOpen(false);
    setActiveDetails(null);
    setActivePreview(null);
    setSelectedJobKey(null);

    window.requestAnimationFrame(() => {
      restoreRailScroll(bodyRef.current, railScrollTop.current);
    });
  }

  return (
    <>
      <aside aria-label="Jobs assist panel" className={styles.jobsRail}>
        <div className={styles.jobsRailHeader}>
          <div className={styles.jobsRailHeaderActions} ref={filtersRef}>
            <button
              aria-expanded={isFiltersOpen}
              aria-haspopup="dialog"
              className={`${styles.jobsRailFilterTrigger} ${
                isFiltersOpen ? styles.jobsRailFilterTriggerActive : ""
              }`}
              onClick={() => {
                setIsFiltersOpen((current) => !current);
              }}
              type="button"
            >
              <SlidersHorizontal aria-hidden="true" size={14} strokeWidth={2} />
              Filters
              {hasActiveFilters ? (
                <span className={styles.jobsRailFilterCount}>{activeFilterCount}</span>
              ) : null}
              <ChevronDown
                aria-hidden="true"
                className={`${styles.jobsRailFilterChevron} ${
                  isFiltersOpen ? styles.jobsRailFilterChevronOpen : ""
                }`}
                size={14}
                strokeWidth={2}
              />
            </button>
            {hasActiveFilters ? (
              <button
                className={styles.jobsRailReset}
                onClick={() => {
                  setFilters(DEFAULT_JOB_RAIL_FILTERS);
                }}
                type="button"
              >
                Reset filters
              </button>
            ) : null}
            <button
              aria-label="Close jobs panel"
              className={styles.jobsRailClose}
              onClick={() => {
                onClose?.();
              }}
              type="button"
            >
              <X aria-hidden="true" size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        <div className={styles.jobsRailBody} ref={bodyRef}>
          {isFiltersOpen ? (
            <div
              aria-label="Jobs rail filters"
              className={styles.jobsRailFiltersPopover}
              ref={filtersPopoverRef}
              role="dialog"
            >
              <label className={styles.jobsSearchField}>
                <Search aria-hidden="true" size={15} strokeWidth={2} />
                <input
                  aria-label="Filter jobs by keyword"
                  onChange={(event) => {
                    setFilters((current) => ({
                      ...current,
                      keyword: event.target.value,
                    }));
                  }}
                  placeholder="Search title, company, skill, or match reason"
                  type="text"
                  value={filters.keyword}
                />
              </label>

              <div className={styles.jobsQuickFilters}>
                {(["all", "remote", "hybrid", "onsite"] as const).map((option) => (
                  <button
                    className={`${styles.jobsQuickFilter} ${
                      filters.workplaceType === option ? styles.jobsQuickFilterActive : ""
                    }`}
                    key={option}
                    onClick={() => {
                      setFilters((current) => ({
                        ...current,
                        workplaceType: option,
                      }));
                    }}
                    type="button"
                  >
                    {option === "all" ? "All workplaces" : WORKPLACE_FILTER_LABELS[option]}
                  </button>
                ))}
              </div>

              <div className={styles.jobsFilterGrid}>
                <label className={styles.jobsField}>
                  <span>Company</span>
                  <select
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        company: event.target.value,
                      }));
                    }}
                    value={filters.company}
                  >
                    <option value="all">All companies</option>
                    {railOptions.companies.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.jobsField}>
                  <span>Location</span>
                  <select
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        location: event.target.value,
                      }));
                    }}
                    value={filters.location}
                  >
                    <option value="all">All locations</option>
                    {railOptions.locations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.jobsField}>
                  <span>Employment</span>
                  <select
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        employmentType: event.target.value as typeof filters.employmentType,
                      }));
                    }}
                    value={filters.employmentType}
                  >
                    <option value="all">Any type</option>
                    {Object.entries(EMPLOYMENT_FILTER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.jobsField}>
                  <span>Source</span>
                  <select
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        source: event.target.value as typeof filters.source,
                      }));
                    }}
                    value={filters.source}
                  >
                    <option value="all">All sources</option>
                    {railOptions.sources.map((source) => (
                      <option key={source} value={source}>
                        {SOURCE_FILTER_LABELS[source]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.jobsField}>
                  <span>Posted</span>
                  <select
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        postedDate: event.target.value as typeof filters.postedDate,
                      }));
                    }}
                    value={filters.postedDate}
                  >
                    <option value="any">Any time</option>
                    {Object.entries(POSTED_DATE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.jobsField}>
                  <span>Sort</span>
                  <select
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        sort: event.target.value as typeof filters.sort,
                      }));
                    }}
                    value={filters.sort}
                  >
                    {Object.entries(SORT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <p className={styles.jobsRailLoading}>Pulling the latest roles from your live jobs feed.</p>
          ) : null}

          {!isLoading && errorMessage && jobs.length === 0 ? (
            <p className={styles.jobsRailError}>{errorMessage}</p>
          ) : null}

          {!isLoading && !errorMessage && jobs.length === 0 ? (
            <p className={styles.jobsRailEmpty}>
              {emptyStateMessage ?? "No live jobs are available from the current jobs source yet."}
            </p>
          ) : null}

          {!isLoading && jobs.length > 0 && filteredJobs.length === 0 ? (
            <div className={styles.jobsFilteredEmpty}>
              <p>No roles match the current filters.</p>
              <button
                className={styles.jobsRailResetInline}
                onClick={() => {
                  setFilters(DEFAULT_JOB_RAIL_FILTERS);
                }}
                type="button"
              >
                Reset filters
              </button>
            </div>
          ) : null}

          {filteredJobs.length > 0 ? (
            <ul className={styles.jobsRailList}>
              {filteredJobs.map((job) => (
                <JobListItem
                  isSelected={job.railKey === selectedJobKey && isDetailsOpen}
                  job={job}
                  key={job.railKey}
                  onApply={onApply}
                  onOpenDetails={openJobDetails}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </aside>

      {activePreview && activeDetails && activeJob ? (
        <JobDetailsModal
          applyAction={<JobApplyButton job={activeJob} label="Apply now" onApply={onApply} />}
          details={activeDetails}
          isLoading={isDetailsLoading}
          isOpen={isDetailsOpen}
          onClose={closeJobDetails}
          onRetry={() => {
            void loadDetails(activePreview, true);
          }}
        />
      ) : null}
    </>
  );
}
