import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { getJobsEnvironmentGuide, getJobsFeedSnapshot } from "@/packages/jobs-domain/src";
import { JobsResults } from "./jobs-results";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Jobs | Career AI",
  description:
    "Run ATS-direct job feeds and aggregator coverage together so Career AI can match verified candidates against real hiring pipelines.",
};

export const dynamic = "force-dynamic";

const INITIAL_ROLE_COUNT = 24;
const LOAD_MORE_INCREMENT = 29;
const PREFETCH_ROLE_COUNT = INITIAL_ROLE_COUNT + LOAD_MORE_INCREMENT;

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

function formatLaneLabel(value: "ats_direct" | "aggregator") {
  return value === "ats_direct" ? "ATS direct" : "Aggregator";
}

function formatStatusLabel(value: "connected" | "degraded" | "not_configured") {
  return value === "connected"
    ? "Connected"
    : value === "degraded"
      ? "Needs attention"
      : "Not configured";
}

function formatStorageLabel(value: "database" | "ephemeral") {
  return value === "database" ? "Saved in Postgres" : "Preview only";
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export default async function JobsPage() {
  const snapshot = await getJobsFeedSnapshot({ limit: PREFETCH_ROLE_COUNT });
  const environmentGuide = getJobsEnvironmentGuide();
  const visibleSources = snapshot.sources.filter((source) => source.status !== "not_configured");
  const degradedSources = visibleSources.filter((source) => source.status === "degraded");
  const summaryTimestamp = snapshot.storage.lastSyncAt || snapshot.generatedAt;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.intro}>
          <div className={styles.introCopy}>
            <h1 className={styles.title}>Search results</h1>
            <p className={styles.metaLine}>
              <span>
                {snapshot.jobs.length} {pluralize(snapshot.jobs.length, "role")} loaded for this
                window
              </span>
              <span>
                {snapshot.summary.connectedSourceCount} live{" "}
                {pluralize(snapshot.summary.connectedSourceCount, "source")}
              </span>
              <span>{formatStorageLabel(snapshot.storage.mode)}</span>
              <span>Updated {formatTimestamp(summaryTimestamp)}</span>
            </p>
            {snapshot.summary.totalJobs === 0 ? (
              <p className={styles.subtitle}>
                Connect at least one live source and Career AI will sync the feed here
                automatically.
              </p>
            ) : null}
          </div>

          <div className={styles.metaBlock}>
            {degradedSources.length > 0 ? (
              <p className={styles.metaNote}>
                {degradedSources.length} {pluralize(degradedSources.length, "source")} need
                attention.
              </p>
            ) : visibleSources.length > 0 ? (
              <p className={styles.metaNote}>Feed details are available below when you need them.</p>
            ) : null}
            <Link className={styles.inlineLink} href="/agent-build">
              Open Agent Builder
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>
        </section>

        <section className={styles.jobsPanel}>
          {snapshot.jobs.length > 0 ? (
            <JobsResults
              initialCount={INITIAL_ROLE_COUNT}
              jobs={snapshot.jobs}
              loadMoreCount={LOAD_MORE_INCREMENT}
            />
          ) : (
            <article className={styles.emptyState}>
              <h3>No job feeds are connected yet.</h3>
              <p>
                The hybrid intake layer is live, but it needs at least one ATS feed or one
                aggregator endpoint to start filling the jobs surface. Once a source is configured,
                Career AI will sync the feed and save those jobs to Postgres automatically.
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
                      <span>{formatLaneLabel(source.lane)}</span>
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
