"use client";

import Link from "next/link";
import type { EmployerCandidateMatchDto } from "@/packages/contracts/src";
import styles from "./employer-candidate-results-rail.module.css";

type EmployerCandidateCardProps = {
  candidate: EmployerCandidateMatchDto;
  isShortlisted?: boolean;
  onReviewMatch?: (candidate: EmployerCandidateMatchDto) => void;
  onShortlist?: (candidate: EmployerCandidateMatchDto) => void;
};

export function EmployerCandidateCard({
  candidate,
  isShortlisted = false,
  onReviewMatch,
  onShortlist,
}: EmployerCandidateCardProps) {
  const roleLine = [candidate.currentRole ?? candidate.targetRole, candidate.location]
    .filter(Boolean)
    .join(" • ");

  return (
    <li className={styles.candidateCard}>
      <div className={styles.candidateCardHeader}>
        <div>
          <p className={styles.candidateName}>{candidate.fullName}</p>
          <p className={styles.candidateRoleLine}>{roleLine || "Career ID profile"}</p>
        </div>
        <div className={styles.credibilityBadge}>
          <strong>{candidate.credibility.label}</strong>
          <span>{candidate.credibility.score}%</span>
        </div>
      </div>

      {candidate.topSkills.length > 0 ? (
        <div className={styles.skillRow}>
          {candidate.topSkills.map((skill) => (
            <span className={styles.skillChip} key={skill}>
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <p className={styles.matchReason}>{candidate.matchReason}</p>

      {candidate.experienceHighlights.length > 0 ? (
        <ul className={styles.highlightList}>
          {candidate.experienceHighlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      ) : null}

      <div className={styles.cardMeta}>
        <span>{candidate.ranking.label}</span>
        <span>{candidate.credibility.verificationSignal}</span>
      </div>

      <div className={styles.cardActions}>
        <Link className={styles.primaryAction} href={candidate.actions.careerIdUrl ?? "#"}>
          View Career ID
        </Link>
        <button
          className={styles.secondaryAction}
          onClick={() => {
            onReviewMatch?.(candidate);
          }}
          type="button"
        >
          Review match
        </button>
        <button
          className={styles.secondaryAction}
          onClick={() => {
            onShortlist?.(candidate);
          }}
          type="button"
        >
          {isShortlisted ? "Shortlisted" : "Shortlist"}
        </button>
      </div>
    </li>
  );
}
