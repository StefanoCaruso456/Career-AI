import type { JobPostingDto } from "@/packages/contracts/src";

export type JobListing = {
  applyUrl: string;
  canonicalApplyUrl: string;
  company: string;
  id: string;
  isOrchestrationReady: boolean;
  sourceLabel: string;
  title: string;
  validationStatus: JobPostingDto["validationStatus"];
};

export function mapJobsToListings(jobs: JobPostingDto[]) {
  return jobs.map((job) => ({
    applyUrl: job.applyUrl,
    canonicalApplyUrl: job.canonicalApplyUrl ?? job.applyUrl,
    company: job.companyName,
    id: job.id,
    isOrchestrationReady: job.orchestrationReadiness ?? false,
    sourceLabel: job.sourceLabel,
    title: job.title,
    validationStatus: job.validationStatus,
  })) satisfies JobListing[];
}
