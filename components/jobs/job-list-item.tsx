"use client";

import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import { JobApplyButton } from "@/components/jobs/job-apply-button";
import {
  formatRelativePostedAt,
  formatSalaryTextForRail,
  getJobRailBadges,
  normalizeEmploymentType,
  sanitizeJobLocationText,
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
} as const;
const HIDDEN_MATCH_REASONS = new Set(["Verified live listing"]);

export function JobListItem({
  isSelected = false,
  job,
  onApply,
  onOpenDetails,
}: JobListItemProps) {
  const normalizedEmploymentType = normalizeEmploymentType(job.employmentType);
  const employmentType =
    normalizedEmploymentType === "unknown"
      ? null
      : EMPLOYMENT_BADGE_LABELS[normalizedEmploymentType];
  const postedLabel = formatRelativePostedAt(job.postedAt);
  const badges = getJobRailBadges(job);
  const salaryText = formatSalaryTextForRail(job.salaryText);
  const location = sanitizeJobLocationText(job.location);
  const supportingMeta = [location, employmentType, salaryText].filter(Boolean);
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
            <span className={styles.jobPosted}>{postedLabel}</span>
          </div>

          <div className={styles.jobCopy}>
            <p className={styles.jobCompany}>{job.company}</p>
            <h3 className={styles.jobTitle}>{job.title}</h3>
          </div>

          {preview ? <p className={styles.jobPreview}>{preview}</p> : null}

          {visibleMatchReason ? (
            <p className={styles.jobSignal}>
              <span>Why it surfaced</span>
              {visibleMatchReason}
            </p>
          ) : null}

          {badges.length > 0 || supportingMeta.length > 0 ? (
            <div className={styles.jobPillCluster}>
              {badges.length > 0 ? (
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
              ) : null}

              {supportingMeta.length > 0 ? (
                <div className={styles.jobMetaRow}>
                  {supportingMeta.map((item) => (
                    <span className={styles.jobMetaPill} key={`${job.railKey}-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
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
