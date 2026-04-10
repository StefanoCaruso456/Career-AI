import type { Metadata } from "next";
import { getJobsEnvironmentGuide, getJobsFeedSnapshot } from "@/packages/jobs-domain/src";
import { JobsResults } from "./jobs-results";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Jobs | Career AI",
  description:
    "Bring live job sources together so Career AI can match verified candidates against real hiring pipelines.",
};

export const dynamic = "force-dynamic";

const INITIAL_ROLE_COUNT = 24;
const LOAD_MORE_INCREMENT = 29;
const INITIAL_REQUEST_LIMIT = INITIAL_ROLE_COUNT;

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Freshness unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatStatusLabel(value: "connected" | "degraded" | "not_configured") {
  return value === "connected"
    ? "Connected"
    : value === "degraded"
      ? "Needs attention"
      : "Not configured";
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export default async function JobsPage() {
  const snapshot = await getJobsFeedSnapshot({ limit: INITIAL_REQUEST_LIMIT });
  const environmentGuide = getJobsEnvironmentGuide();
  const visibleSources = snapshot.sources.filter((source) => source.status === "connected");
  const companyOptions = Array.from(new Set(visibleSources.map((source) => source.label))).sort(
    (left, right) => left.localeCompare(right),
  );
  const totalAvailableCount = visibleSources.reduce((sum, source) => sum + source.jobCount, 0);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.intro}>
          <div className={styles.introCopy}>
            <h1 className={styles.title}>Search results</h1>
            {snapshot.summary.totalJobs === 0 ? (
              <p className={styles.subtitle}>
                Connect at least one live source and Career AI will sync the feed here
                automatically.
              </p>
            ) : null}
          </div>
        </section>

        <section className={styles.jobsPanel}>
          {snapshot.jobs.length > 0 ? (
            <JobsResults
              initialCount={INITIAL_ROLE_COUNT}
              initialCompanyOptions={companyOptions}
              initialRequestLimit={INITIAL_REQUEST_LIMIT}
              initialTotalAvailableCount={totalAvailableCount}
              jobs={snapshot.jobs}
              loadMoreCount={LOAD_MORE_INCREMENT}
            />
          ) : (
            <article className={styles.emptyState}>
              <h3>No job feeds are connected yet.</h3>
              <p>
                The intake layer is live, but it needs at least one job source to start filling the
                jobs surface. Once a source is configured, Career AI will sync the feed and save
                those jobs to Postgres automatically.
              </p>
              <div className={styles.envList}>
                {environmentGuide.map((entry) => (
                  <div className={styles.envCard} key={entry.key}>
                    <code>{entry.key}</code>
                    <span>{entry.example}</span>
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>

        {visibleSources.length > 0 ? (
          <details className={styles.feedDetails}>
            <summary className={styles.feedSummary}>
              <span>Feed details</span>
              <span>
                {visibleSources.length} active {pluralize(visibleSources.length, "source")}
              </span>
            </summary>
            <div className={styles.feedList}>
              {visibleSources.map((source) => (
                <article className={styles.feedItem} key={source.key}>
                  <div className={styles.feedItemTop}>
                    <div>
                      <h3>{source.label}</h3>
                      <p>{source.endpointLabel ?? "Awaiting provider config"}</p>
                    </div>
                    <div className={styles.feedItemMeta}>
                      <span>{source.jobCount} {pluralize(source.jobCount, "role")}</span>
                      <span
                        className={`${styles.feedStatus} ${
                          source.status === "connected"
                            ? styles.feedStatusConnected
                            : source.status === "degraded"
                              ? styles.feedStatusDegraded
                              : styles.feedStatusPending
                        }`}
                      >
                        {formatStatusLabel(source.status)}
                      </span>
                    </div>
                  </div>
                  <p className={styles.feedItemMessage}>
                    {source.lastSyncedAt
                      ? `Updated ${formatTimestamp(source.lastSyncedAt)}. ${source.message}`
                      : source.message}
                  </p>
                </article>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
