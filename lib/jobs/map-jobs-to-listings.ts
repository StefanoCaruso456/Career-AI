import type { JobPostingDto, JobsPanelResponseDto } from "@/packages/contracts/src";

export type JobListing = {
  applyUrl: string;
  canonicalApplyUrl: string;
  company: string;
  id: string;
  isOrchestrationReady: boolean;
  location: string | null;
  matchReason: string;
  relevanceScore: number | null;
  salaryText: string | null;
  sourceLabel: string;
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
    id: job.id,
    isOrchestrationReady: job.orchestrationReadiness ?? false,
    location: job.location,
    matchReason: job.matchSummary ?? "Grounded match from the live jobs inventory.",
    relevanceScore: job.relevanceScore ?? null,
    salaryText: job.salaryText ?? null,
    sourceLabel: job.sourceLabel,
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
      id: card.jobId,
      isOrchestrationReady: job?.orchestrationReadiness ?? false,
      location: card.location,
      matchReason: card.matchReason,
      relevanceScore: card.relevanceScore,
      salaryText: card.salaryText,
      sourceLabel: job?.sourceLabel ?? "Live inventory",
      summary: card.summary,
      title: card.title,
      validationStatus: job?.validationStatus,
      workplaceType: card.workplaceType,
    } satisfies JobListing;
  });
}
