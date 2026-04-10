import type { JobPostingDto } from "@/packages/contracts/src";

export type JobListing = {
  company: string;
  id: string;
  title: string;
};

export function mapJobsToListings(jobs: JobPostingDto[]) {
  return jobs.map((job) => ({
    company: job.companyName,
    id: job.id,
    title: job.title,
  })) satisfies JobListing[];
}
