import Link from "next/link";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import styles from "./page.module.css";

type EmployerCandidatesPageProps = {
  searchParams?: Promise<{
    candidateId?: string;
    careerId?: string;
    shareProfileId?: string;
    shareToken?: string;
  }>;
};

function resolveLookupValue(searchParams: {
  candidateId?: string;
  careerId?: string;
  shareProfileId?: string;
  shareToken?: string;
}) {
  return (
    searchParams.careerId?.trim() ||
    searchParams.candidateId?.trim() ||
    searchParams.shareProfileId?.trim() ||
    searchParams.shareToken?.trim() ||
    null
  );
}

export default async function EmployerCandidatesPage({
  searchParams,
}: EmployerCandidatesPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const lookupValue = resolveLookupValue(resolvedSearchParams);
  const lookupResponse = lookupValue
    ? await searchEmployerCandidates({
        limit: 1,
        prompt: lookupValue,
      })
    : null;
  const candidate = lookupResponse?.candidates[0] ?? null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Employer candidate detail</p>
            <h1 className={styles.title}>
              {candidate ? candidate.fullName : "Open a recruiter-safe Career ID view"}
            </h1>
            <p className={styles.subtitle}>
              {candidate
                ? "Review the recruiter-safe candidate summary, Career ID routing, and trust profile access without falling back to seeker job workflows."
                : "Use a Career ID, candidate identifier, or trust-profile lookup from the employer sourcer rail to open recruiter-safe candidate detail here."}
            </p>
          </div>

          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/employer">
              Back to employer sourcer
            </Link>
            {candidate?.actions.trustProfileUrl ? (
              <Link className={styles.secondaryAction} href={candidate.actions.trustProfileUrl}>
                Review trust profile
              </Link>
            ) : null}
          </div>
        </section>

        {lookupValue && !candidate ? (
          <section className={styles.emptyState}>
            <h2>No recruiter-safe candidate matched that lookup.</h2>
            <p>
              We did not find a Career ID candidate for <strong>{lookupValue}</strong>. Return to
              the employer sourcer and try another identifier.
            </p>
          </section>
        ) : null}

        {!lookupValue ? (
          <section className={styles.emptyState}>
            <h2>Ready for direct candidate lookup</h2>
            <p>
              This route is now wired for recruiter-safe candidate detail. Open it from the
              employer rail or pass a Career ID, candidate id, or recruiter-safe share identifier
              in the URL.
            </p>
          </section>
        ) : null}

        {candidate ? (
          <div className={styles.grid}>
            <section className={styles.primaryPanel}>
              <div className={styles.identityRow}>
                <div>
                  <p className={styles.careerIdLabel}>Career ID</p>
                  <p className={styles.careerIdValue}>{candidate.careerId}</p>
                </div>
                <div className={styles.rankingBadge}>
                  <strong>{candidate.ranking.label}</strong>
                  <span>{candidate.ranking.score}% match</span>
                </div>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Headline</span>
                  <strong>{candidate.headline ?? candidate.currentRole ?? candidate.targetRole ?? "Career ID candidate"}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Location</span>
                  <strong>{candidate.location ?? "Not specified"}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Employer signal</span>
                  <strong>{candidate.currentEmployer ?? "Hidden by visibility controls"}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Verification</span>
                  <strong>{candidate.credibility.verificationSignal}</strong>
                </div>
              </div>

              <div className={styles.panelSection}>
                <h2>Recruiter-safe preview</h2>
                <p>{candidate.profileSummary ?? "This candidate has not shared a preview summary yet."}</p>
              </div>

              <div className={styles.panelSection}>
                <h2>Why this candidate matched</h2>
                <p>{candidate.matchReason}</p>
              </div>

              <div className={styles.panelSection}>
                <h2>Experience highlights</h2>
                {candidate.experienceHighlights.length > 0 ? (
                  <ul className={styles.highlightList}>
                    {candidate.experienceHighlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No experience highlights are visible for this candidate yet.</p>
                )}
              </div>

              <div className={styles.panelSection}>
                <h2>Top matched skills</h2>
                <div className={styles.skillRow}>
                  {candidate.topSkills.map((skill) => (
                    <span className={styles.skillChip} key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <aside className={styles.sidePanel}>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Credibility</span>
                <strong>{candidate.credibility.label}</strong>
                <p>{candidate.credibility.score}% confidence score</p>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Evidence count</span>
                <strong>{candidate.credibility.evidenceCount}</strong>
                <p>{candidate.credibility.verifiedExperienceCount} verified experience signal(s)</p>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Next actions</span>
                <div className={styles.metricActions}>
                  <Link className={styles.primaryAction} href={candidate.actions.careerIdUrl ?? "#"}>
                    View Career ID
                  </Link>
                  {candidate.actions.trustProfileUrl ? (
                    <Link className={styles.secondaryAction} href={candidate.actions.trustProfileUrl}>
                      Review trust profile
                    </Link>
                  ) : (
                    <span className={styles.disabledAction}>Trust profile unavailable</span>
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}
