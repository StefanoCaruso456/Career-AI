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

const directLookupPattern =
  /\b(?:TAID-\d{6}|tal_[a-z0-9-]+|share_[a-z0-9-]+|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i;

function buildQuerySummary(query?: EmployerCandidateSearchQueryDto | null) {
  if (!query) {
    return [];
  }

  const summary = [
    query.parsedCriteria.titleHints[0],
    query.parsedCriteria.skillKeywords.length > 0
      ? `Skills: ${query.parsedCriteria.skillKeywords.slice(0, 3).join(", ")}`
      : null,
    query.parsedCriteria.location ? `Location: ${query.parsedCriteria.location}` : null,
    query.filters.verifiedExperienceOnly ? "Verified experience only" : null,
  ].filter((value): value is string => Boolean(value));

  if (summary.length > 0) {
    return summary;
  }

  const directLookup = query.prompt.match(directLookupPattern)?.[0] ?? null;

  return directLookup ? [`Direct lookup: ${directLookup}`] : [];
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
