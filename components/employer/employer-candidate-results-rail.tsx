"use client";

import type {
  EmployerCandidateMatchDto,
  EmployerCandidateSearchQueryDto,
} from "@/packages/contracts/src";
import { EmployerCandidateCard } from "./employer-candidate-card";
import styles from "./employer-candidate-results-rail.module.css";

type EmployerCandidateResultsRailProps = {
  candidates: EmployerCandidateMatchDto[];
  errorMessage?: string | null;
  isLoading?: boolean;
  onOpenDetail?: (candidate: EmployerCandidateMatchDto) => void;
  onRefresh?: () => void;
  onShortlist?: (candidate: EmployerCandidateMatchDto) => void;
  query?: EmployerCandidateSearchQueryDto | null;
  shortlistedCandidateIds?: string[];
};

export function EmployerCandidateResultsRail({
  candidates,
  errorMessage = null,
  isLoading = false,
  onOpenDetail,
  onRefresh,
  onShortlist,
  shortlistedCandidateIds = [],
}: EmployerCandidateResultsRailProps) {
  return (
    <aside aria-label="Candidate sourcing panel" className={styles.resultsRail}>
      <div className={styles.resultsRailHeader}>
        <button
          className={styles.resultsRailRefresh}
          disabled={isLoading}
          onClick={() => {
            onRefresh?.();
          }}
          type="button"
        >
          Find aligned candidates
        </button>
        <p className={styles.resultsRailLead}>
          Search verified Career ID talent, then open a candidate only when you need the full recruiter-safe profile.
        </p>
      </div>

      <div className={styles.resultsRailBody}>
        {isLoading ? (
          <p className={styles.resultsRailLoading}>
            Searching Career ID candidates...
          </p>
        ) : null}

        {!isLoading && errorMessage && candidates.length === 0 ? (
          <p className={styles.resultsRailError}>
            {errorMessage || "Unable to load recruiter candidate results."}
          </p>
        ) : null}

        {!isLoading && !errorMessage && candidates.length === 0 ? (
          <p className={styles.resultsRailEmpty}>
            No aligned candidates found. Try broadening the role, skills, or pasted job
            description.
          </p>
        ) : null}

        {candidates.length > 0 ? (
          <ul className={styles.resultsRailList}>
            {candidates.map((candidate) => (
              <EmployerCandidateCard
                candidate={candidate}
                isShortlisted={shortlistedCandidateIds.includes(candidate.candidateId)}
                key={candidate.candidateId}
                onOpenDetail={onOpenDetail}
                onShortlist={onShortlist}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
