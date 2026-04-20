"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import {
  jobsFeedResponseSchema,
  type JobDetailsDto,
  type JobRailFilterOptionsDto,
} from "@/packages/contracts/src";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import type { ApplyContinuationResult } from "@/lib/jobs/start-apply-run-client";
import { mapJobsToListings } from "@/lib/jobs/map-jobs-to-listings";
import { loadJobListings } from "@/lib/jobs/load-job-listings";
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
  getJobRailLocationLabel,
  getJobRailOptions,
  POSTED_DATE_LABELS,
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
  onApply?:
    | ((job: JobListing) => Promise<string | ApplyContinuationResult> | string | ApplyContinuationResult)
    | undefined;
  onClose?: () => void;
};

const DEFAULT_FIND_JOBS_LOCATION = "United States";
const FIND_JOBS_LOCATION_STORAGE_KEY = "career-ai.jobs.side-panel.location";

function getActiveFilterCount(filters: typeof DEFAULT_JOB_RAIL_FILTERS) {
  return [
    filters.company !== "all",
    filters.employmentType !== "all",
    filters.keyword.trim().length > 0,
    filters.location !== "all",
    filters.postedDate !== "any",
    filters.workplaceType !== "all",
  ].filter(Boolean).length;
}

function hasOwnSalaryOverride(
  record: Record<string, string | null>,
  jobId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, jobId);
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

const POSTED_DATE_SEARCH_PROMPTS = {
  "14d": "posted within the last 14 days",
  "1d": "posted today",
  "3d": "posted within the last 3 days",
  "7d": "posted within the last 7 days",
} as const;

function buildKeywordSearchPrompt(
  filters: typeof DEFAULT_JOB_RAIL_FILTERS,
  keyword: string,
) {
  const trimmedKeyword = keyword.trim();

  if (trimmedKeyword.length < 2) {
    return null;
  }

  const qualifiers = [
    filters.employmentType !== "all"
      ? EMPLOYMENT_FILTER_LABELS[filters.employmentType].toLowerCase()
      : null,
    filters.workplaceType !== "all"
      ? WORKPLACE_FILTER_LABELS[filters.workplaceType].toLowerCase()
      : null,
  ].filter((value): value is string => Boolean(value));

  const promptSegments = [
    `Find ${qualifiers.length > 0 ? `${qualifiers.join(" ")} ` : ""}${trimmedKeyword} jobs`,
  ];

  if (filters.company !== "all") {
    promptSegments.push(`at ${filters.company}`);
  }

  if (filters.location !== "all") {
    promptSegments.push(`in ${filters.location}`);
  }

  if (filters.postedDate !== "any") {
    promptSegments.push(POSTED_DATE_SEARCH_PROMPTS[filters.postedDate]);
  }

  return promptSegments.join(" ");
}

function getRenderedFindJobsLocationOptions(jobs: JobListing[]) {
  return new Set(
    jobs
      .map((job) => job.location)
      .map((location) => getJobRailLocationLabel(location))
      .filter((value): value is string => Boolean(value)),
  );
}

function getDefaultFindJobsLocation(jobs: JobListing[]) {
  return getRenderedFindJobsLocationOptions(jobs).has(DEFAULT_FIND_JOBS_LOCATION)
    ? DEFAULT_FIND_JOBS_LOCATION
    : "all";
}

function resolveFindJobsLocationPreference(location: string | null, jobs: JobListing[]) {
  if (location === "all") {
    return "all";
  }

  const availableLocations = getRenderedFindJobsLocationOptions(jobs);

  if (location && availableLocations.has(location)) {
    return location;
  }

  return availableLocations.has(DEFAULT_FIND_JOBS_LOCATION) ? DEFAULT_FIND_JOBS_LOCATION : "all";
}

function getDefaultFindJobsFilters(
  jobs: JobListing[],
) {
  return {
    ...DEFAULT_JOB_RAIL_FILTERS,
    location: getDefaultFindJobsLocation(jobs),
  };
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
  const defaultFilters = getDefaultFindJobsFilters(jobs);
  const [filters, setFilters] = useState(defaultFilters);
  const deferredKeyword = useDeferredValue(filters.keyword.trim().toLowerCase());
  const [activePreview, setActivePreview] = useState<JobDetailsPreview | null>(null);
  const [activeDetails, setActiveDetails] = useState<JobDetailsDto | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [companyScopedJobs, setCompanyScopedJobs] = useState<JobListing[] | null>(null);
  const [companyScopeError, setCompanyScopeError] = useState<string | null>(null);
  const [isCompanyScopeLoading, setIsCompanyScopeLoading] = useState(false);
  const [keywordSearchJobs, setKeywordSearchJobs] = useState<JobListing[] | null>(null);
  const [keywordSearchFilterOptions, setKeywordSearchFilterOptions] =
    useState<JobRailFilterOptionsDto | null>(null);
  const [keywordSearchError, setKeywordSearchError] = useState<string | null>(null);
  const [isKeywordSearchLoading, setIsKeywordSearchLoading] = useState(false);
  const [selectedJobKey, setSelectedJobKey] = useState<string | null>(null);
  const [salaryOverrides, setSalaryOverrides] = useState<Record<string, string | null>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const filtersPopoverRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const railScrollTop = useRef(0);
  const filtersScrollTop = useRef(0);
  const filtersChangedWhileOpen = useRef(false);
  const hasHydratedLocationPreference = useRef(false);
  const companyScopeRequestSequence = useRef(0);
  const keywordSearchRequestSequence = useRef(0);
  const salaryHydrationInFlight = useRef(new Set<string>());
  const panelJobs = filters.company === "all" ? jobs : companyScopedJobs ?? jobs;
  const resolvedPanelJobs = panelJobs.map((job) =>
    hasOwnSalaryOverride(salaryOverrides, job.id)
      ? {
          ...job,
          salaryText: salaryOverrides[job.id],
        }
      : job,
  );
  const localFilteredJobs = filterAndSortJobsForRail(resolvedPanelJobs, {
    ...filters,
    keyword: deferredKeyword,
  });
  const keywordSearchPrompt =
    localFilteredJobs.length === 0 ? buildKeywordSearchPrompt(filters, deferredKeyword) : null;
  const displayJobs = keywordSearchPrompt ? keywordSearchJobs ?? [] : panelJobs;
  const resolvedDisplayJobs = keywordSearchPrompt
    ? displayJobs.map((job) =>
        hasOwnSalaryOverride(salaryOverrides, job.id)
          ? {
              ...job,
              salaryText: salaryOverrides[job.id],
            }
          : job,
      )
    : resolvedPanelJobs;
  const railOptions = getJobRailOptions(
    resolvedDisplayJobs,
    keywordSearchPrompt ? keywordSearchFilterOptions ?? filterOptions : filterOptions,
  );
  const activeFilterCount = getActiveFilterCount(filters);
  const filteredJobs = keywordSearchPrompt
    ? filterAndSortJobsForRail(resolvedDisplayJobs, {
        ...filters,
        keyword: "",
      })
    : localFilteredJobs;
  const hasActiveFilters = activeFilterCount > 0;
  const activeJob = selectedJobKey
    ? resolvedDisplayJobs.find((job) => job.railKey === selectedJobKey) ?? null
    : null;
  const loadingMessage = isKeywordSearchLoading
    ? `Searching live roles for "${filters.keyword.trim()}".`
    : isLoading
    ? "Pulling the latest roles from your live jobs feed."
    : isCompanyScopeLoading
      ? `Loading ${filters.company} roles from your jobs feed.`
      : null;
  const railErrorMessage = keywordSearchError ?? companyScopeError ?? errorMessage;

  useEffect(() => {
    return () => {
      activeController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (hasHydratedLocationPreference.current) {
      return;
    }

    let nextLocation = defaultFilters.location;

    try {
      nextLocation = resolveFindJobsLocationPreference(
        window.localStorage.getItem(FIND_JOBS_LOCATION_STORAGE_KEY),
        jobs,
      );
    } catch {
      nextLocation = defaultFilters.location;
    } finally {
      hasHydratedLocationPreference.current = true;
    }

    setFilters((current) =>
      current.location === nextLocation
        ? current
        : {
            ...current,
            location: nextLocation,
          },
    );
  }, [defaultFilters.location, jobs]);

  useEffect(() => {
    if (!hasHydratedLocationPreference.current) {
      return;
    }

    try {
      window.localStorage.setItem(FIND_JOBS_LOCATION_STORAGE_KEY, filters.location);
    } catch {
      // Ignore storage access failures so filtering still works in restricted contexts.
    }
  }, [filters.location]);

  useEffect(() => {
    if (!hasHydratedLocationPreference.current) {
      return;
    }

    const resolvedLocation = resolveFindJobsLocationPreference(filters.location, jobs);

    if (resolvedLocation === filters.location) {
      return;
    }

    setFilters((current) =>
      current.location === resolvedLocation
        ? current
        : {
            ...current,
            location: resolvedLocation,
          },
    );
  }, [filters.location, jobs]);

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

      closeFilters();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeFilters();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFiltersOpen]);

  function updateFilters(
    updater:
      | typeof DEFAULT_JOB_RAIL_FILTERS
      | ((current: typeof DEFAULT_JOB_RAIL_FILTERS) => typeof DEFAULT_JOB_RAIL_FILTERS),
  ) {
    filtersChangedWhileOpen.current = true;
    setFilters(updater);
  }

  function openFilters() {
    filtersScrollTop.current = bodyRef.current?.scrollTop ?? 0;
    filtersChangedWhileOpen.current = false;
    restoreRailScroll(bodyRef.current, 0);
    setIsFiltersOpen(true);
  }

  function closeFilters() {
    setIsFiltersOpen(false);

    if (!filtersChangedWhileOpen.current) {
      window.requestAnimationFrame(() => {
        restoreRailScroll(bodyRef.current, filtersScrollTop.current);
      });
    }
  }

  useEffect(() => {
    if (filters.company === "all") {
      companyScopeRequestSequence.current += 1;
      setCompanyScopedJobs(null);
      setCompanyScopeError(null);
      setIsCompanyScopeLoading(false);
      return;
    }

    const requestSequence = companyScopeRequestSequence.current + 1;
    const searchParams = new URLSearchParams({
      limit: String(Math.max(jobs.length, 24)),
    });
    searchParams.append("company", filters.company);

    companyScopeRequestSequence.current = requestSequence;
    setCompanyScopeError(null);
    setIsCompanyScopeLoading(true);
    setCompanyScopedJobs(null);

    void fetch(`/api/v1/jobs?${searchParams.toString()}`, {
      cache: "no-store",
      method: "GET",
    })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string; message?: string };

        if (!response.ok) {
          throw new Error(payload.error || payload.message || "Jobs could not be loaded right now.");
        }

        return jobsFeedResponseSchema.parse(payload);
      })
      .then((snapshot) => {
        if (companyScopeRequestSequence.current !== requestSequence) {
          return;
        }

        setCompanyScopedJobs(mapJobsToListings(snapshot.jobs));
      })
      .catch((error) => {
        if (companyScopeRequestSequence.current !== requestSequence) {
          return;
        }

        setCompanyScopedJobs([]);
        setCompanyScopeError(
          error instanceof Error
            ? error.message
            : `${filters.company} roles could not be loaded right now.`,
        );
      })
      .finally(() => {
        if (companyScopeRequestSequence.current !== requestSequence) {
          return;
        }

        setIsCompanyScopeLoading(false);
      });
  }, [filters.company, jobs.length]);

  useEffect(() => {
    if (!keywordSearchPrompt) {
      keywordSearchRequestSequence.current += 1;
      setKeywordSearchJobs(null);
      setKeywordSearchFilterOptions(null);
      setKeywordSearchError(null);
      setIsKeywordSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestSequence = keywordSearchRequestSequence.current + 1;

    keywordSearchRequestSequence.current = requestSequence;
    setKeywordSearchError(null);
    setKeywordSearchFilterOptions(null);
    setIsKeywordSearchLoading(true);
    setKeywordSearchJobs(null);

    void loadJobListings({
      limit: Math.max(jobs.length, 24),
      prompt: keywordSearchPrompt,
      refresh: false,
      signal: controller.signal,
    })
      .then((result) => {
        if (keywordSearchRequestSequence.current !== requestSequence) {
          return;
        }

        setKeywordSearchJobs(result.listings);
        setKeywordSearchFilterOptions(result.rail.filterOptions ?? null);
      })
      .catch((error) => {
        if (controller.signal.aborted || keywordSearchRequestSequence.current !== requestSequence) {
          return;
        }

        setKeywordSearchJobs([]);
        setKeywordSearchFilterOptions(null);
        setKeywordSearchError(
          error instanceof Error ? error.message : "Live job search could not be loaded right now.",
        );
      })
      .finally(() => {
        if (keywordSearchRequestSequence.current !== requestSequence) {
          return;
        }

        setIsKeywordSearchLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [jobs.length, keywordSearchPrompt]);

  useEffect(() => {
    if (!selectedJobKey) {
      return;
    }

    const nextActiveJob = resolvedDisplayJobs.find((job) => job.railKey === selectedJobKey);

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
  }, [resolvedDisplayJobs, selectedJobKey]);

  useEffect(() => {
    const jobsMissingSalary = filteredJobs
      .filter(
        (job) =>
          !job.salaryText &&
          !hasOwnSalaryOverride(salaryOverrides, job.id) &&
          !salaryHydrationInFlight.current.has(job.id),
      )
      .slice(0, 8);

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
            const details = await fetchJobDetails(buildJobDetailsPreview(job), {
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
  }, [filteredJobs, salaryOverrides]);

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
                if (isFiltersOpen) {
                  closeFilters();
                  return;
                }

                openFilters();
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
                  updateFilters(defaultFilters);
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

        <div className={styles.jobsRailBody} data-testid="jobs-rail-body" ref={bodyRef}>
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
                    updateFilters((current) => ({
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
                      updateFilters((current) => ({
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
                      updateFilters((current) => ({
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
                      updateFilters((current) => ({
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
                      updateFilters((current) => ({
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
                  <span>Posted</span>
                  <select
                    onChange={(event) => {
                      updateFilters((current) => ({
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
              </div>
            </div>
          ) : null}

          {loadingMessage ? (
            <p className={styles.jobsRailLoading}>{loadingMessage}</p>
          ) : null}

          {!loadingMessage && railErrorMessage && displayJobs.length === 0 ? (
            <p className={styles.jobsRailError}>{railErrorMessage}</p>
          ) : null}

          {!loadingMessage &&
          !railErrorMessage &&
          displayJobs.length === 0 &&
          !keywordSearchPrompt ? (
            <p className={styles.jobsRailEmpty}>
              {emptyStateMessage ?? "No live jobs are available from the current jobs source yet."}
            </p>
          ) : null}

          {!loadingMessage &&
          !railErrorMessage &&
          (keywordSearchPrompt ? displayJobs.length === 0 : displayJobs.length > 0) &&
          filteredJobs.length === 0 ? (
            <div className={styles.jobsFilteredEmpty}>
              <p>No roles match the current filters.</p>
              <button
                className={styles.jobsRailResetInline}
                onClick={() => {
                  updateFilters(defaultFilters);
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
