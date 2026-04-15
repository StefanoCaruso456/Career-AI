"use client";

import { ProfileCompletionGuard } from "@/components/easy-apply-profile/profile-completion-guard";
import { resolveSchemaFamily } from "@/lib/application-profiles/resolver";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import { JobDetailsTrigger } from "@/components/jobs/job-details-trigger";
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
      <div className={styles.jobActions}>
        <ProfileCompletionGuard
          applyUrl={job.canonicalApplyUrl}
          buttonLabel="APPLY"
          buttonVariant="jobs-card"
          className={styles.jobApplyButton}
          companyName={job.company}
          jobTitle={job.title}
          resolveApplyUrl={onApply ? () => onApply(job) : undefined}
          schemaFamily={schemaFamily}
        />
        <JobDetailsTrigger
          applyAction={
            <ProfileCompletionGuard
              applyUrl={job.canonicalApplyUrl}
              buttonLabel="Apply now"
              buttonVariant="jobs-card"
              companyName={job.company}
              jobTitle={job.title}
              resolveApplyUrl={onApply ? () => onApply(job) : undefined}
              schemaFamily={schemaFamily}
            />
          }
          buttonClassName={styles.jobDetailsButton}
          buttonLabel="Read more"
          preview={{
            applyUrl: job.applyUrl,
            company: job.company,
            descriptionSnippet: job.summary,
            employmentType: null,
            externalJobId: null,
            id: job.id,
            location: job.location,
            postedAt: null,
            sourceLabel: job.sourceLabel,
            sourceUrl: job.canonicalApplyUrl,
            title: job.title,
          }}
        />
      </div>
      <div className={styles.jobCopy}>
        <p className={styles.jobCompany}>{job.company}</p>
        <p className={styles.jobTitle}>{job.title}</p>
        {meta ? <p className={styles.jobMeta}>{meta}</p> : null}
      </div>
    </li>
  );
}
