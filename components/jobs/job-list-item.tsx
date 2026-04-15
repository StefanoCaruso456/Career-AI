"use client";

import { ProfileCompletionGuard } from "@/components/easy-apply-profile/profile-completion-guard";
import { resolveSchemaFamily } from "@/lib/application-profiles/resolver";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import styles from "./jobs-side-panel.module.css";

type JobListItemProps = {
  job: JobListing;
  onApply?: (job: JobListing) => Promise<string> | string;
};

export function JobListItem({ job, onApply }: JobListItemProps) {
  const meta = [job.location, job.workplaceType, job.salaryText].filter(Boolean).join(" • ");
  const schemaFamily = resolveSchemaFamily({
    applyUrl: job.canonicalApplyUrl,
    companyName: job.company,
  });

  return (
    <li className={styles.jobRow}>
      <ProfileCompletionGuard
        applyUrl={job.canonicalApplyUrl}
        buttonLabel="APPLY"
        className={styles.jobApplyButton}
        companyName={job.company}
        jobTitle={job.title}
        resolveApplyUrl={onApply ? () => onApply(job) : undefined}
        schemaFamily={schemaFamily}
      />
      <div className={styles.jobCopy}>
        <p className={styles.jobCompany}>{job.company}</p>
        <p className={styles.jobTitle}>{job.title}</p>
        {meta ? <p className={styles.jobMeta}>{meta}</p> : null}
      </div>
    </li>
  );
}
