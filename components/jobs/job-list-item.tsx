"use client";

import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import styles from "./jobs-side-panel.module.css";

type JobListItemProps = {
  job: JobListing;
  onApply?: (job: JobListing) => void;
};

export function JobListItem({ job, onApply }: JobListItemProps) {
  const meta = [job.location, job.workplaceType, job.salaryText].filter(Boolean).join(" • ");

  return (
    <li className={styles.jobRow}>
      <button
        className={styles.jobApplyButton}
        onClick={() => {
          onApply?.(job);
        }}
        type="button"
      >
        APPLY
      </button>
      <div className={styles.jobCopy}>
        <p className={styles.jobCompany}>{job.company}</p>
        <p className={styles.jobTitle}>{job.title}</p>
        {meta ? <p className={styles.jobMeta}>{meta}</p> : null}
      </div>
    </li>
  );
}
