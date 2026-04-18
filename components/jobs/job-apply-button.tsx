"use client";

import { ProfileCompletionGuard } from "@/components/easy-apply-profile/profile-completion-guard";
import type { ApplyContinuationResult } from "@/lib/jobs/start-apply-run-client";
import { resolveSchemaFamily } from "@/lib/application-profiles/resolver";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";

type JobApplyButtonProps = {
  className?: string;
  job: JobListing;
  label: string;
  onApply?: (job: JobListing) => Promise<string | ApplyContinuationResult> | string | ApplyContinuationResult;
};

export function JobApplyButton({
  className,
  job,
  label,
  onApply,
}: JobApplyButtonProps) {
  const schemaFamily = resolveSchemaFamily({
    applyUrl: job.canonicalApplyUrl,
    companyName: job.company,
  });

  return (
    <ProfileCompletionGuard
      applyUrl={job.canonicalApplyUrl}
      buttonLabel={label}
      buttonVariant="jobs-card"
      className={className}
      companyName={job.company}
      jobTitle={job.title}
      resolveApplyUrl={onApply ? () => onApply(job) : undefined}
      schemaFamily={schemaFamily}
    />
  );
}
