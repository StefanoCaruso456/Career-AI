"use client";

import { X } from "lucide-react";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import { JobListItem } from "@/components/jobs/job-list-item";
import styles from "./jobs-side-panel.module.css";

type JobsSidePanelProps = {
  emptyStateMessage?: string | null;
  errorMessage?: string | null;
  isLoading?: boolean;
  jobs: JobListing[];
  onApply?: (job: JobListing) => void;
  onClose?: () => void;
  onRefresh?: () => void;
};

export function JobsSidePanel({
  emptyStateMessage = null,
  errorMessage = null,
  isLoading = false,
  jobs,
  onApply,
  onClose,
  onRefresh,
}: JobsSidePanelProps) {
  return (
    <aside aria-label="Jobs assist panel" className={styles.jobsRail}>
      <div className={styles.jobsRailHeader}>
        <button
          className={styles.jobsRailRefresh}
          disabled={isLoading}
          onClick={() => {
            onRefresh?.();
          }}
          type="button"
        >
          Find NEW Jobs
        </button>
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

      <div className={styles.jobsRailBody}>
        {isLoading ? (
          <p className={styles.jobsRailLoading}>Pulling the latest roles from your live jobs feed.</p>
        ) : null}

        {!isLoading && errorMessage && jobs.length === 0 ? (
          <p className={styles.jobsRailError}>{errorMessage}</p>
        ) : null}

        {!isLoading && !errorMessage && jobs.length === 0 ? (
          <p className={styles.jobsRailEmpty}>
            {emptyStateMessage ?? "No live jobs are available from the current jobs source yet."}
          </p>
        ) : null}

        {jobs.length > 0 ? (
          <ul className={styles.jobsRailList}>
            {jobs.map((job) => (
              <JobListItem job={job} key={job.id} onApply={onApply} />
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
