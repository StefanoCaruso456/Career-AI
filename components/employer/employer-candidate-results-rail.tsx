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
  onRefresh?: () => void;
  onReviewMatch?: (candidate: EmployerCandidateMatchDto) => void;
  onShortlist?: (candidate: EmployerCandidateMatchDto) => void;
  query?: EmployerCandidateSearchQueryDto | null;
  shortlistedCandidateIds?: string[];
};

function buildQuerySummary(query?: EmployerCandidateSearchQueryDto | null) {
  if (!query) {
    return [];
  }

  return [
    query.parsedCriteria.titleHints[0],
    query.parsedCriteria.skillKeywords.length > 0
      ? `Skills: ${query.parsedCriteria.skillKeywords.slice(0, 3).join(", ")}`
      : null,
    query.parsedCriteria.location ? `Location: ${query.parsedCriteria.location}` : null,
    query.filters.verifiedExperienceOnly ? "Verified experience only" : null,
  ].filter((value): value is string => Boolean(value));
}

export function EmployerCandidateResultsRail({
  candidates,
  errorMessage = null,
  isLoading = false,
  onRefresh,
  onReviewMatch,
  onShortlist,
  query = null,
  shortlistedCandidateIds = [],
}: EmployerCandidateResultsRailProps) {
  const querySummary = buildQuerySummary(query);

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
          Search verified Career ID talent and rank stronger credibility signals first.
        </p>
        {querySummary.length > 0 ? (
          <div className={styles.summaryRow}>
            {querySummary.map((item) => (
              <span className={styles.summaryChip} key={item}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.resultsRailBody}>
        {isLoading ? (
          <p className={styles.resultsRailLoading}>
            Searching Career ID candidates and ranking verified matches...
          </p>
        ) : null}

        {!isLoading && errorMessage && candidates.length === 0 ? (
          <p className={styles.resultsRailError}>{errorMessage}</p>
        ) : null}

        {!isLoading && !errorMessage && candidates.length === 0 ? (
          <p className={styles.resultsRailEmpty}>
            No aligned candidates surfaced yet. Try broadening the title, adding a few skills, or
            pasting the full job description.
          </p>
        ) : null}

        {candidates.length > 0 ? (
          <ul className={styles.resultsRailList}>
            {candidates.map((candidate) => (
              <EmployerCandidateCard
                candidate={candidate}
                isShortlisted={shortlistedCandidateIds.includes(candidate.candidateId)}
                key={candidate.candidateId}
                onReviewMatch={onReviewMatch}
                onShortlist={onShortlist}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
