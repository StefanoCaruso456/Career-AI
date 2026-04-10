"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { JobPostingDto } from "@/packages/contracts/src";
import styles from "./page.module.css";

type JobsResultsProps = {
  jobs: JobPostingDto[];
  initialCount?: number;
  loadMoreCount?: number;
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Freshness unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatQualityLabel(value: "high_signal" | "coverage") {
  return value === "high_signal" ? "High-signal" : "Coverage";
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export function JobsResults({
  jobs,
  initialCount = 24,
  loadMoreCount = 29,
}: JobsResultsProps) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, jobs.length));
  const visibleJobs = jobs.slice(0, visibleCount);
  const remainingCount = Math.max(jobs.length - visibleCount, 0);
  const nextRevealCount = Math.min(loadMoreCount, remainingCount);

  return (
    <div className={styles.jobsResults}>
      <div className={styles.resultsHeader}>
        <p className={styles.resultsSummary}>
          Showing {visibleJobs.length} of {jobs.length} {pluralize(jobs.length, "role")} currently
          loaded.
        </p>
        {remainingCount > 0 ? (
          <p className={styles.resultsNote}>
            {remainingCount} more {pluralize(remainingCount, "role")} ready in this window.
          </p>
        ) : null}
      </div>

      <div className={styles.jobsGrid}>
        {visibleJobs.map((job) => (
          <article className={styles.jobCard} key={job.id}>
            <div className={styles.badgeRow}>
              <span className={styles.qualityBadge}>{formatQualityLabel(job.sourceQuality)}</span>
            </div>
            <div className={styles.jobCopy}>
              <div>
                <span className={styles.cardEyebrow}>{job.companyName}</span>
                <h3>{job.title}</h3>
              </div>
              <p className={styles.jobMeta}>
                {[job.location, job.department, job.commitment].filter(Boolean).join(" • ") ||
                  "Details are still coming in from the source."}
              </p>
            </div>
            <div className={styles.jobFooter}>
              <span>Updated {formatTimestamp(job.updatedAt || job.postedAt)}</span>
            </div>
            <a className={styles.jobLink} href={job.applyUrl} rel="noreferrer" target="_blank">
              Open posting
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </a>
          </article>
        ))}
      </div>

      {remainingCount > 0 ? (
        <div className={styles.loadMoreRow}>
          <button
            className={styles.loadMoreButton}
            onClick={() => {
              setVisibleCount((current) => Math.min(current + loadMoreCount, jobs.length));
            }}
            type="button"
          >
            More...
          </button>
          <p className={styles.loadMoreNote}>
            Reveal {nextRevealCount} more {pluralize(nextRevealCount, "role")}.
          </p>
        </div>
      ) : null}
    </div>
  );
}
