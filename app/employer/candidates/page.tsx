import Link from "next/link";
import { RecruiterAccessRequestPanel } from "@/components/access-requests/recruiter-access-request-panel";
import { ApiError } from "@/packages/contracts/src";
import { getEmployerCandidateTrace } from "@/packages/recruiter-read-model/src";
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
  let trace = null;

  if (lookupValue) {
    try {
      trace = await getEmployerCandidateTrace({
        correlationId: crypto.randomUUID(),
        input: {
          lookup: lookupValue,
        },
      });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        throw error;
      }
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Employer candidate detail</p>
            <h1 className={styles.title}>
              {trace ? trace.candidate.fullName : "Open a recruiter-safe Career ID view"}
            </h1>
            <p className={styles.subtitle}>
              {trace
                ? "Review the recruiter-safe Career ID trace, including persisted profile data, visibility-aware evidence, and current trust-link access for this single job seeker."
                : "Use a Career ID, candidate identifier, or trust-profile lookup from the employer workspace to open recruiter-safe candidate detail here."}
            </p>
          </div>

          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/employer">
              Back to employer workspace
            </Link>
            {trace ? (
              <Link className={styles.secondaryAction} href="#trusted-profile">
                Review trust profile
              </Link>
            ) : null}
          </div>
        </section>

        {lookupValue && !trace ? (
          <section className={styles.emptyState}>
            <h2>No recruiter-safe candidate matched that lookup.</h2>
            <p>
              We did not find a Career ID candidate for <strong>{lookupValue}</strong>. Return to
              the employer workspace and try another identifier.
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

        {trace ? (
          <div className={styles.grid}>
            <section className={styles.primaryPanel} id="trusted-profile">
              <div className={styles.identityRow}>
                <div>
                  <p className={styles.careerIdLabel}>Career ID</p>
                  <p className={styles.careerIdValue}>{trace.candidate.careerId}</p>
                </div>
                <div className={styles.rankingBadge}>
                  <strong>Career ID trace</strong>
                  <span>{trace.lookup.resolvedBy.replaceAll("_", " ")}</span>
                </div>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Headline</span>
                  <strong>
                    {trace.candidate.headline ??
                      trace.candidate.currentRole ??
                      trace.candidate.targetRole ??
                      "Career ID candidate"}
                  </strong>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Location</span>
                  <strong>{trace.candidate.location ?? "Not specified"}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Employer signal</span>
                  <strong>{trace.candidate.currentEmployer ?? "Hidden by visibility controls"}</strong>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>Visibility</span>
                  <strong>{trace.candidate.recruiterVisibility}</strong>
                </div>
              </div>

              <div className={styles.panelSection}>
                <h2>Recruiter-safe preview</h2>
                <p>
                  {trace.candidate.profileSummary ??
                    "This candidate has not shared a preview summary yet."}
                </p>
              </div>

              <div className={styles.panelSection}>
                <h2>Profile narrative</h2>
                <p>
                  {trace.profile?.coreNarrative ??
                    trace.candidate.profileSummary ??
                    "No longer-form profile narrative is persisted yet."}
                </p>
              </div>

              <div className={styles.panelSection}>
                <h2>Experience highlights</h2>
                {trace.searchProjection.experienceHighlights.length > 0 ? (
                  <ul className={styles.highlightList}>
                    {trace.searchProjection.experienceHighlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No experience highlights are visible for this candidate yet.</p>
                )}
              </div>

              <div className={styles.panelSection}>
                <h2>Searchable skills</h2>
                <div className={styles.skillRow}>
                  {trace.searchProjection.displaySkills.map((skill) => (
                    <span className={styles.skillChip} key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.panelSection}>
                <h2>Evidence records</h2>
                {trace.evidenceRecords.length > 0 ? (
                  <div className={styles.detailList}>
                    {trace.evidenceRecords.map((record) => (
                      <article className={styles.detailCard} key={record.id}>
                        <div className={styles.detailHeader}>
                          <strong>{record.templateId}</strong>
                          <span>{record.status}</span>
                        </div>
                        <p>
                          {record.sourceOrIssuer ?? "Source hidden by visibility controls"}
                        </p>
                        <p>{record.whyItMatters}</p>
                        <div className={styles.metaList}>
                          <span>Issued: {record.issuedOn || "Not specified"}</span>
                          <span>{record.fileCount} file reference(s)</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>No persisted evidence records are attached to this candidate yet.</p>
                )}
              </div>

              <div className={styles.panelSection}>
                <h2>Visible employment records</h2>
                {trace.visibleEmploymentRecords.length > 0 ? (
                  <div className={styles.detailList}>
                    {trace.visibleEmploymentRecords.map((record) => (
                      <article className={styles.detailCard} key={record.claimId}>
                        <div className={styles.detailHeader}>
                          <strong>{record.roleTitle}</strong>
                          <span>{record.verificationStatusOptional ?? "No status label"}</span>
                        </div>
                        <p>{record.employerName}</p>
                        <div className={styles.metaList}>
                          <span>{record.startDate}</span>
                          <span>{record.endDateOptional ?? "Present"}</span>
                          <span>{record.artifactCount} artifact(s)</span>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>Employment records are not visible for this candidate trace.</p>
                )}
              </div>

              <RecruiterAccessRequestPanel
                candidateId={trace.candidate.candidateId}
                candidateName={trace.candidate.fullName}
              />
            </section>

            <aside className={styles.sidePanel}>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Credibility</span>
                <strong>{trace.credibility.label}</strong>
                <p>{trace.credibility.score}% confidence score</p>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Evidence count</span>
                <strong>{trace.credibility.evidenceCount}</strong>
                <p>
                  {trace.credibility.verifiedExperienceCount} verified experience signal(s)
                </p>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Onboarding</span>
                <strong>{trace.onboarding.status}</strong>
                <p>{trace.onboarding.profileCompletionPercent}% profile completion</p>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Search projection</span>
                <strong>{trace.searchProjection.searchableKeywords.length} keywords</strong>
                <p>{trace.credibility.verificationSignal}</p>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Next actions</span>
                <div className={styles.metricActions}>
                  <Link className={styles.primaryAction} href={trace.actions.careerIdUrl ?? "#"}>
                    View Career ID
                  </Link>
                  <Link className={styles.secondaryAction} href="#trusted-profile">
                      Review trust profile
                  </Link>
                </div>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>Trace metadata</span>
                <div className={styles.metaList}>
                  <span>Lookup: {trace.lookup.value}</span>
                  <span>Resolved by: {trace.lookup.resolvedBy}</span>
                  <span>Role type: {trace.onboarding.roleType ?? "candidate"}</span>
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}
