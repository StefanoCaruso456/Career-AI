import { notFound } from "next/navigation";
import { ApiError } from "@/packages/contracts/src";
import { getRecruiterTrustProfileByToken } from "@/packages/recruiter-read-model/src";
import styles from "./page.module.css";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default async function ShareProfilePage({ params }: PageProps) {
  const { token } = await params;

  try {
    const profile = await getRecruiterTrustProfileByToken({
      token,
      actorType: "system_service",
      actorId: "public_request",
      correlationId: crypto.randomUUID(),
    });

    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <p className={styles.eyebrow}>Recruiter Trust Profile</p>
            <div className={styles.titleRow}>
              <div className={styles.titleBlock}>
                <h1 className={styles.title}>{profile.candidate.displayName}</h1>
                <p className={styles.subtitle}>
                  Verified hiring signals, structured evidence, and visibility controls
                  distilled into a recruiter-safe trust view.
                </p>
              </div>
              <div className={styles.agentPill}>
                <span className={styles.agentLabel}>Career AI</span>
                <span className={styles.agentValue}>{profile.candidate.talentAgentId}</span>
              </div>
            </div>
          </section>

          <section className={styles.stats}>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Total claims</p>
              <p className={styles.statValue}>{profile.trustSummary.totalClaims}</p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Reviewed</p>
              <p className={styles.statValue}>{profile.trustSummary.totalReviewedClaims}</p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Source verified</p>
              <p className={styles.statValue}>{profile.trustSummary.totalVerifiedClaims}</p>
            </article>
            <article className={styles.statCard}>
              <p className={styles.statLabel}>Last verification</p>
              <p className={styles.statValue}>
                {formatDate(profile.trustSummary.lastVerifiedAtOptional)}
              </p>
            </article>
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <h2 className={styles.panelTitle}>Visible employment record</h2>
              <p className={styles.panelCopy}>
                This share view exposes only the categories the candidate has chosen
                to make visible.
              </p>

              {profile.visibleEmploymentRecords.length === 0 ? (
                <div className={styles.emptyState}>
                  Employment records are not currently included in this shared trust
                  profile.
                </div>
              ) : (
                <div className={styles.records}>
                  {profile.visibleEmploymentRecords.map((record) => (
                    <article className={styles.recordCard} key={record.claimId}>
                      <div className={styles.recordHeader}>
                        <div>
                          <h3 className={styles.recordTitle}>{record.roleTitle}</h3>
                          <p className={styles.recordMeta}>
                            {record.employerName} · {formatDate(record.startDate)}
                            {record.endDateOptional
                              ? ` to ${formatDate(record.endDateOptional)}`
                              : " to present"}
                          </p>
                        </div>

                        <div className={styles.recordBadges}>
                          {record.verificationStatusOptional ? (
                            <span className={styles.badge}>
                              {record.verificationStatusOptional.replaceAll("_", " ")}
                            </span>
                          ) : null}
                          {record.confidenceTierOptional ? (
                            <span className={styles.badge}>
                              {record.confidenceTierOptional.replaceAll("_", " ")}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.recordFooter}>
                        <span>{record.artifactCount} evidence artifact(s)</span>
                        <span>Updated {formatDate(record.lastUpdatedAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <aside className={styles.panel}>
              <h2 className={styles.panelTitle}>Trust reading guide</h2>
              <p className={styles.panelCopy}>
                Use this page as a trust layer, not a replacement for final diligence.
              </p>
              <ul className={styles.list}>
                <li>
                  <strong>Reviewed</strong> means evidence has been checked by a reviewer
                  but not yet confirmed by an originating source.
                </li>
                <li>
                  <strong>Source verified</strong> means a trusted source confirmed the
                  claim directly.
                </li>
                <li>
                  <strong>Hidden categories</strong> are omitted by candidate choice and
                  do not appear in this projection.
                </li>
              </ul>
              <p className={styles.small}>
                Generated {formatDate(profile.generatedAt)}. Raw documents and internal
                reviewer notes are intentionally excluded from this share page.
              </p>
            </aside>
          </section>
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
