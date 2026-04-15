"use client";

import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import { JobApplyButton } from "@/components/jobs/job-apply-button";
import {
  formatRelativePostedAt,
  getJobRailBadges,
  normalizeEmploymentType,
} from "@/components/jobs/job-rail-utils";
import styles from "./jobs-side-panel.module.css";

type JobListItemProps = {
  isSelected?: boolean;
  job: JobListing;
  onApply?: (job: JobListing) => Promise<string> | string;
  onOpenDetails?: (job: JobListing) => void;
};

const EMPLOYMENT_BADGE_LABELS = {
  contract: "Contract",
  full_time: "Full-time",
  internship: "Internship",
  part_time: "Part-time",
  temporary: "Temporary",
  unknown: "Type unknown",
} as const;
const HIDDEN_MATCH_REASONS = new Set(["Verified live listing"]);

export function JobListItem({
  isSelected = false,
  job,
  onApply,
  onOpenDetails,
}: JobListItemProps) {
  const employmentType = EMPLOYMENT_BADGE_LABELS[normalizeEmploymentType(job.employmentType)];
  const postedLabel = formatRelativePostedAt(job.postedAt);
  const badges = getJobRailBadges(job);
  const supportingMeta = [job.location, employmentType, job.salaryText].filter(Boolean);
  const visibleMatchReason = job.matchReason?.trim()
    ? HIDDEN_MATCH_REASONS.has(job.matchReason.trim())
      ? null
      : job.matchReason.trim()
    : null;
  const preview = job.summary?.trim() || visibleMatchReason;

  return (
    <li className={styles.jobRow}>
      <article
        className={`${styles.jobCard} ${isSelected ? styles.jobCardSelected : ""}`}
        data-selected={isSelected ? "true" : "false"}
      >
        <button
          aria-label={`Open details for ${job.title}`}
          aria-pressed={isSelected}
          className={styles.jobCardButton}
          onClick={() => {
            onOpenDetails?.(job);
          }}
          type="button"
        >
          <div className={styles.jobCardTopline}>
            <div className={styles.jobBadgeRow}>
              {badges.map((badge) => (
                <span
                  className={`${styles.jobBadge} ${
                    badge.tone === "accent"
                      ? styles.jobBadgeAccent
                      : badge.tone === "success"
                        ? styles.jobBadgeSuccess
                        : styles.jobBadgeNeutral
                  }`}
                  key={`${job.railKey}-${badge.label}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <span className={styles.jobPosted}>{postedLabel}</span>
          </div>

          <div className={styles.jobCopy}>
            <p className={styles.jobCompany}>{job.company}</p>
            <h3 className={styles.jobTitle}>{job.title}</h3>
          </div>

          {supportingMeta.length > 0 ? (
            <div className={styles.jobMetaRow}>
              {supportingMeta.map((item) => (
                <span className={styles.jobMetaPill} key={`${job.railKey}-${item}`}>
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          {preview ? <p className={styles.jobPreview}>{preview}</p> : null}

          {visibleMatchReason ? (
            <p className={styles.jobSignal}>
              <span>Why it surfaced</span>
              {visibleMatchReason}
            </p>
          ) : null}
        </button>

        <div className={styles.jobActions}>
          <JobApplyButton
            className={styles.jobApplyButton}
            job={job}
            label="Apply"
            onApply={onApply}
          />
          <button
            className={styles.jobDetailsButton}
            onClick={() => {
              onOpenDetails?.(job);
            }}
            type="button"
          >
            View details
          </button>
        </div>
      </article>
    </li>
  );
}
