import type { JobDetailsSource } from "@/packages/contracts/src";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import type { JobDetailsPreview } from "./job-details-types";

export type JobRailEmploymentFilter =
  | "all"
  | "contract"
  | "full_time"
  | "internship"
  | "part_time"
  | "temporary"
  | "unknown";
export type JobRailPostedDateFilter = "any" | "1d" | "14d" | "3d" | "7d";
export type JobRailSort = "company" | "recent" | "relevance";
export type JobRailSourceFilter = "all" | JobDetailsSource;
export type JobRailWorkplaceFilter = "all" | "hybrid" | "onsite" | "remote" | "unknown";

export type JobRailFilters = {
  company: string;
  employmentType: JobRailEmploymentFilter;
  keyword: string;
  location: string;
  postedDate: JobRailPostedDateFilter;
  sort: JobRailSort;
  source: JobRailSourceFilter;
  workplaceType: JobRailWorkplaceFilter;
};

export type JobRailBadge = {
  label: string;
  tone: "accent" | "neutral" | "success";
};

export const DEFAULT_JOB_RAIL_FILTERS: JobRailFilters = {
  company: "all",
  employmentType: "all",
  keyword: "",
  location: "all",
  postedDate: "any",
  sort: "relevance",
  source: "all",
  workplaceType: "all",
};

export const EMPLOYMENT_FILTER_LABELS: Record<
  Exclude<JobRailEmploymentFilter, "all">,
  string
> = {
  contract: "Contract",
  full_time: "Full-time",
  internship: "Internship",
  part_time: "Part-time",
  temporary: "Temporary",
  unknown: "Unknown",
};

export const WORKPLACE_FILTER_LABELS: Record<
  Exclude<JobRailWorkplaceFilter, "all">,
  string
> = {
  hybrid: "Hybrid",
  onsite: "On-site",
  remote: "Remote",
  unknown: "Unknown",
};

export const SOURCE_FILTER_LABELS: Record<JobDetailsSource, string> = {
  ashby: "Ashby",
  greenhouse: "Greenhouse",
  lever: "Lever",
  linkedin: "LinkedIn",
  other: "Other",
  workable: "Workable",
  workday: "Workday",
};

export const POSTED_DATE_LABELS: Record<
  Exclude<JobRailPostedDateFilter, "any">,
  string
> = {
  "14d": "Last 14 days",
  "1d": "Today",
  "3d": "Last 3 days",
  "7d": "Last 7 days",
};

export const SORT_LABELS: Record<JobRailSort, string> = {
  company: "Company A-Z",
  recent: "Most recent",
  relevance: "Relevance",
};

function normalizeHumanLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getJobTimestamp(postedAt: string | null) {
  if (!postedAt) {
    return null;
  }

  const timestamp = Date.parse(postedAt);

  return Number.isNaN(timestamp) ? null : timestamp;
}

export function inferJobSourceType(job: Pick<JobListing, "sourceKey" | "sourceLabel" | "sourceUrl">) {
  const value = `${job.sourceKey} ${job.sourceLabel} ${job.sourceUrl}`.toLowerCase();

  if (value.includes("workday")) {
    return "workday" satisfies JobDetailsSource;
  }

  if (value.includes("greenhouse")) {
    return "greenhouse" satisfies JobDetailsSource;
  }

  if (value.includes("lever")) {
    return "lever" satisfies JobDetailsSource;
  }

  if (value.includes("ashby")) {
    return "ashby" satisfies JobDetailsSource;
  }

  if (value.includes("workable")) {
    return "workable" satisfies JobDetailsSource;
  }

  if (value.includes("linkedin")) {
    return "linkedin" satisfies JobDetailsSource;
  }

  return "other" satisfies JobDetailsSource;
}

export function normalizeEmploymentType(value: string | null | undefined) {
  const normalized = normalizeHumanLabel(value ?? "");

  if (!normalized) {
    return "unknown" satisfies Exclude<JobRailEmploymentFilter, "all">;
  }

  if (normalized.includes("intern")) {
    return "internship" satisfies Exclude<JobRailEmploymentFilter, "all">;
  }

  if (
    normalized.includes("contract") ||
    normalized.includes("contractor") ||
    normalized.includes("freelance")
  ) {
    return "contract" satisfies Exclude<JobRailEmploymentFilter, "all">;
  }

  if (normalized.includes("temporary") || normalized.includes("temp")) {
    return "temporary" satisfies Exclude<JobRailEmploymentFilter, "all">;
  }

  if (normalized.includes("part")) {
    return "part_time" satisfies Exclude<JobRailEmploymentFilter, "all">;
  }

  if (normalized.includes("full")) {
    return "full_time" satisfies Exclude<JobRailEmploymentFilter, "all">;
  }

  return "unknown" satisfies Exclude<JobRailEmploymentFilter, "all">;
}

export function getJobRailOptions(jobs: JobListing[]) {
  const companies = Array.from(
    new Set(
      jobs
        .map((job) => job.company?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const locations = Array.from(
    new Set(
      jobs
        .map((job) => job.location?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const sources = Array.from(new Set(jobs.map((job) => inferJobSourceType(job)))).sort((left, right) =>
    SOURCE_FILTER_LABELS[left].localeCompare(SOURCE_FILTER_LABELS[right]),
  );

  return {
    companies,
    locations,
    sources,
  };
}

function matchesPostedDateFilter(
  postedAt: string | null,
  filter: JobRailPostedDateFilter,
  now = Date.now(),
) {
  if (filter === "any") {
    return true;
  }

  const timestamp = getJobTimestamp(postedAt);

  if (timestamp === null) {
    return false;
  }

  const thresholdByFilter = {
    "14d": 14 * 24 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "3d": 3 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  } as const;

  return now - timestamp <= thresholdByFilter[filter];
}

export function formatRelativePostedAt(postedAt: string | null, now = Date.now()) {
  const timestamp = getJobTimestamp(postedAt);

  if (timestamp === null) {
    return "Posted date unavailable";
  }

  const diffMs = Math.max(now - timestamp, 0);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays <= 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "1 day ago";
  }

  if (diffDays < 14) {
    return `${diffDays} days ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(timestamp));
}

export function getJobRailBadges(job: JobListing, now = Date.now()) {
  const badges: JobRailBadge[] = [];
  const source = inferJobSourceType(job);
  const workplaceLabel =
    job.workplaceType && job.workplaceType !== "unknown"
      ? WORKPLACE_FILTER_LABELS[job.workplaceType]
      : null;

  badges.push({
    label: SOURCE_FILTER_LABELS[source],
    tone: "neutral",
  });

  if (workplaceLabel) {
    badges.push({
      label: workplaceLabel,
      tone: "accent",
    });
  }

  if (job.validationStatus === "active_verified") {
    badges.push({
      label: "Verified",
      tone: "success",
    });
  }

  if (job.isOrchestrationReady) {
    badges.push({
      label: "Career AI ready",
      tone: "accent",
    });
  }

  if (matchesPostedDateFilter(job.postedAt, "3d", now)) {
    badges.push({
      label: "New",
      tone: "success",
    });
  }

  return badges;
}

export function buildJobDetailsPreview(job: JobListing): JobDetailsPreview {
  return {
    applyUrl: job.applyUrl,
    company: job.company,
    descriptionSnippet: job.summary,
    employmentType: job.employmentType,
    externalJobId: job.externalJobId,
    id: job.id,
    location: job.location,
    postedAt: job.postedAt,
    sourceLabel: job.sourceLabel,
    sourceUrl: job.sourceUrl,
    title: job.title,
    workplaceType: job.workplaceType ?? "unknown",
  };
}

function compareText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", undefined, {
    sensitivity: "base",
  });
}

export function filterAndSortJobsForRail(
  jobs: JobListing[],
  filters: JobRailFilters,
  now = Date.now(),
) {
  const keyword = filters.keyword.trim().toLowerCase();

  return [...jobs]
    .filter((job) => {
      const haystack = [
        job.company,
        job.employmentType,
        job.location,
        job.matchReason,
        job.sourceLabel,
        job.summary,
        job.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const normalizedCompany = normalizeHumanLabel(job.company);
      const normalizedLocation = normalizeHumanLabel(job.location ?? "");
      const workplaceType = job.workplaceType ?? "unknown";
      const employmentType = normalizeEmploymentType(job.employmentType);
      const sourceType = inferJobSourceType(job);

      return (
        (keyword.length === 0 || haystack.includes(keyword)) &&
        (filters.company === "all" ||
          normalizedCompany === normalizeHumanLabel(filters.company)) &&
        (filters.location === "all" ||
          normalizedLocation === normalizeHumanLabel(filters.location)) &&
        (filters.workplaceType === "all" || workplaceType === filters.workplaceType) &&
        (filters.employmentType === "all" || employmentType === filters.employmentType) &&
        (filters.source === "all" || sourceType === filters.source) &&
        matchesPostedDateFilter(job.postedAt, filters.postedDate, now)
      );
    })
    .sort((left, right) => {
      if (filters.sort === "company") {
        return compareText(left.company, right.company) || compareText(left.title, right.title);
      }

      if (filters.sort === "recent") {
        const leftTime = getJobTimestamp(left.postedAt) ?? 0;
        const rightTime = getJobTimestamp(right.postedAt) ?? 0;

        return rightTime - leftTime || compareText(left.company, right.company);
      }

      const leftScore = left.relevanceScore ?? -1;
      const rightScore = right.relevanceScore ?? -1;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      const leftTime = getJobTimestamp(left.postedAt) ?? 0;
      const rightTime = getJobTimestamp(right.postedAt) ?? 0;

      return rightTime - leftTime || compareText(left.company, right.company);
    });
}
