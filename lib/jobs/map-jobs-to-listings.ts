import type {
  JobDetailsSource,
  JobPostingDto,
  JobsPanelResponseDto,
} from "@/packages/contracts/src";
import { formatJobMatchReason } from "@/lib/jobs/format-job-match-reason";

function inferSourceType(job: Pick<JobPostingDto, "canonicalJobUrl" | "applyUrl" | "sourceKey" | "sourceLabel">) {
  const value =
    `${job.sourceKey} ${job.sourceLabel} ${job.canonicalJobUrl ?? job.applyUrl}`.toLowerCase();

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

export type JobListing = {
  applyUrl: string;
  canonicalApplyUrl: string;
  company: string;
  employmentType: string | null;
  externalJobId: string | null;
  id: string;
  isOrchestrationReady: boolean;
  location: string | null;
  matchReason: string;
  postedAt: string | null;
  railKey: string;
  relevanceScore: number | null;
  salaryText: string | null;
  sourceKey: string;
  sourceLabel: string;
  sourceType: JobDetailsSource;
  sourceUrl: string;
  summary: string | null;
  title: string;
  validationStatus: JobPostingDto["validationStatus"];
  workplaceType: JobPostingDto["workplaceType"] | null;
};

export function mapJobsToListings(jobs: JobPostingDto[]) {
  return jobs.map((job) => ({
    applyUrl: job.applyUrl,
    canonicalApplyUrl: job.canonicalApplyUrl ?? job.applyUrl,
    company: job.companyName,
    employmentType: job.commitment ?? null,
    externalJobId: job.externalSourceJobId ?? job.externalId,
    id: job.id,
    isOrchestrationReady: job.orchestrationReadiness ?? false,
    location: job.location,
    matchReason: formatJobMatchReason({
      matchReasons: job.matchReasons,
      matchSummary: job.matchSummary,
    }),
    postedAt: job.updatedAt ?? job.postedAt ?? null,
    railKey: `${job.sourceKey}:${job.id}`,
    relevanceScore: job.relevanceScore ?? null,
    salaryText: job.salaryText ?? null,
    sourceKey: job.sourceKey,
    sourceLabel: job.sourceLabel,
    sourceType: inferSourceType(job),
    sourceUrl: job.canonicalJobUrl ?? job.canonicalApplyUrl ?? job.applyUrl,
    summary: job.descriptionSnippet ?? null,
    title: job.title,
    validationStatus: job.validationStatus,
    workplaceType: job.workplaceType ?? null,
  })) satisfies JobListing[];
}

export function mapJobsPanelToListings(panel: JobsPanelResponseDto) {
  const jobById = new Map(panel.jobs.map((job) => [job.id, job] satisfies [string, JobPostingDto]));

  return panel.rail.cards.map((card) => {
    const job = jobById.get(card.jobId);

    return {
      applyUrl: card.applyUrl,
      canonicalApplyUrl: job?.canonicalApplyUrl ?? job?.applyUrl ?? card.applyUrl,
      company: card.company,
      employmentType: job?.commitment ?? null,
      externalJobId: job?.externalSourceJobId ?? job?.externalId ?? null,
      id: card.jobId,
      isOrchestrationReady: job?.orchestrationReadiness ?? false,
      location: card.location,
      matchReason: formatJobMatchReason({
        matchReason: card.matchReason,
        matchReasons: job?.matchReasons,
        matchSummary: job?.matchSummary,
      }),
      postedAt: job?.updatedAt ?? job?.postedAt ?? null,
      railKey: `${job?.sourceKey ?? "unknown"}:${card.jobId}`,
      relevanceScore: card.relevanceScore,
      salaryText: card.salaryText,
      sourceKey: job?.sourceKey ?? "unknown",
      sourceLabel: job?.sourceLabel ?? "Live inventory",
      sourceType: inferSourceType({
        applyUrl: job?.applyUrl ?? card.applyUrl,
        canonicalJobUrl: job?.canonicalJobUrl ?? null,
        sourceKey: job?.sourceKey ?? "unknown",
        sourceLabel: job?.sourceLabel ?? "Live inventory",
      }),
      sourceUrl: job?.canonicalJobUrl ?? job?.canonicalApplyUrl ?? job?.applyUrl ?? card.applyUrl,
      summary: card.summary,
      title: card.title,
      validationStatus: job?.validationStatus,
      workplaceType: card.workplaceType,
    } satisfies JobListing;
  });
}
