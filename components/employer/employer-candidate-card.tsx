"use client";

import Link from "next/link";
import type { EmployerCandidateMatchDto } from "@/packages/contracts/src";
import styles from "./employer-candidate-results-rail.module.css";

type EmployerCandidateCardProps = {
  candidate: EmployerCandidateMatchDto;
  isShortlisted?: boolean;
  onOpenDetail?: (candidate: EmployerCandidateMatchDto) => void;
  onShortlist?: (candidate: EmployerCandidateMatchDto) => void;
};

export function EmployerCandidateCard({
  candidate,
  isShortlisted = false,
  onOpenDetail,
  onShortlist,
}: EmployerCandidateCardProps) {
  const roleLine = [candidate.currentRole ?? candidate.targetRole, candidate.currentEmployer, candidate.location]
    .filter(Boolean)
    .join(" • ");
  const previewSkills = candidate.topSkills.slice(0, 3);
  const overflowSkillCount = Math.max(candidate.topSkills.length - previewSkills.length, 0);
  const careerIdHref = candidate.actions.careerIdUrl ?? candidate.actions.profileUrl ?? "#";

  return (
    <li className={styles.candidateCard}>
      <div className={styles.candidateCardTop}>
        <button
          className={styles.candidateCardPreview}
          onClick={() => {
            onOpenDetail?.(candidate);
          }}
          type="button"
        >
          <div className={styles.candidateCardHeader}>
            <div className={styles.candidateIdentity}>
              <p className={styles.candidateCareerId}>Career ID {candidate.careerId}</p>
              <p className={styles.candidateName}>{candidate.fullName}</p>
              <p className={styles.candidateRoleLine}>{roleLine || "Career ID profile"}</p>
            </div>
          </div>

          {previewSkills.length > 0 ? (
            <div className={styles.skillRow}>
              {previewSkills.map((skill) => (
                <span className={styles.skillChip} key={skill}>
                  {skill}
                </span>
              ))}
              {overflowSkillCount > 0 ? (
                <span className={styles.skillChip}>+{overflowSkillCount} more</span>
              ) : null}
            </div>
          ) : null}
        </button>

        <div className={styles.candidateCardAside}>
          <div className={styles.credibilityBadge}>
            <strong>{candidate.credibility.label}</strong>
            <span>{candidate.credibility.score}%</span>
          </div>
          <Link className={[styles.secondaryAction, styles.careerIdAction].join(" ")} href={careerIdHref}>
            View Career ID
          </Link>
        </div>
      </div>

      <div className={styles.cardActions}>
        <button
          className={styles.primaryAction}
          onClick={() => {
            onOpenDetail?.(candidate);
          }}
          type="button"
        >
          More
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
