"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { EmployerCandidateMatchDto } from "@/packages/contracts/src";
import styles from "./employer-candidate-detail-modal.module.css";

type EmployerCandidateDetailModalProps = {
  candidate: EmployerCandidateMatchDto;
  isShortlisted?: boolean;
  onClose: () => void;
  onShortlist?: (candidate: EmployerCandidateMatchDto) => void;
};

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function EmployerCandidateDetailModal({
  candidate,
  isShortlisted = false,
  onClose,
  onShortlist,
}: EmployerCandidateDetailModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const careerIdHref = candidate.actions.careerIdUrl ?? candidate.actions.profileUrl ?? "#";
  const headline =
    candidate.headline ??
    candidate.currentRole ??
    candidate.targetRole ??
    "Career ID candidate";
  const roleLine = [candidate.currentRole ?? candidate.targetRole, candidate.currentEmployer, candidate.location]
    .filter(Boolean)
    .join(" • ");
  const summary =
    candidate.profileSummary ??
    "This recruiter-safe Career ID profile has not shared a summary yet.";

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    const originalOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.modal}
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Career ID {candidate.careerId}</p>
            <h2 className={styles.title} id={titleId}>
              {candidate.fullName}
            </h2>
            <p className={styles.subtitle} id={descriptionId}>
              {roleLine || headline}
            </p>
          </div>

          <div className={styles.headerMeta}>
            <div className={styles.scoreBadge}>
              <strong>{candidate.ranking.label}</strong>
              <span>{candidate.ranking.score}% match</span>
            </div>
            <div className={styles.scoreBadge}>
              <strong>{candidate.credibility.label}</strong>
              <span>{candidate.credibility.score}% credibility</span>
            </div>
            <button
              className={styles.closeButton}
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              <X aria-hidden="true" size={16} />
              <span className={styles.srOnly}>Close candidate detail</span>
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.primaryColumn}>
            <section className={styles.section}>
              <p className={styles.sectionLabel}>Recruiter-safe summary</p>
              <p className={styles.sectionBody}>{summary}</p>
            </section>

            <section className={styles.section}>
              <p className={styles.sectionLabel}>Why this candidate matched</p>
              <p className={styles.sectionBody}>{candidate.matchReason}</p>
            </section>

            {candidate.experienceHighlights.length > 0 ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>Experience highlights</p>
                <ul className={styles.highlightList}>
                  {candidate.experienceHighlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {candidate.topSkills.length > 0 ? (
              <section className={styles.section}>
                <p className={styles.sectionLabel}>Top matched skills</p>
                <div className={styles.skillRow}>
                  {candidate.topSkills.map((skill) => (
                    <span className={styles.skillChip} key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className={styles.sideColumn}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Headline</span>
              <strong>{headline}</strong>
              <p>{candidate.location ?? "Location not shared"}</p>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Verification signal</span>
              <strong>{candidate.credibility.verificationSignal}</strong>
              <p>
                {formatCount(candidate.credibility.verifiedExperienceCount, "verified role", "verified roles")}
              </p>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Evidence depth</span>
              <strong>{formatCount(candidate.credibility.evidenceCount, "artifact", "artifacts")}</strong>
              <p>Shared for recruiter review inside this Career ID profile.</p>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Next actions</span>
              <div className={styles.actionStack}>
                <button
                  className={styles.primaryAction}
                  onClick={() => {
                    onShortlist?.(candidate);
                  }}
                  type="button"
                >
                  {isShortlisted ? "Shortlisted" : "Shortlist candidate"}
                </button>
                <Link className={styles.secondaryAction} href={careerIdHref}>
                  View Career ID
                </Link>
                {candidate.actions.trustProfileUrl ? (
                  <Link className={styles.secondaryAction} href={candidate.actions.trustProfileUrl}>
                    Review trust profile
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={[styles.secondaryAction, styles.secondaryActionDisabled].join(" ")}
                  >
                    Trust profile unavailable
                  </span>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
