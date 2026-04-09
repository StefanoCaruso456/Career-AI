import type { Metadata } from "next";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Compass,
  Radar,
  Sparkles,
  TowerControl,
} from "lucide-react";
import Link from "next/link";
import { getJobsEnvironmentGuide, getJobsFeedSnapshot } from "@/packages/jobs-domain/src";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Jobs | Career AI",
  description:
    "Run ATS-direct job feeds and aggregator coverage together so Career AI can match verified candidates against real hiring pipelines.",
};

export const dynamic = "force-dynamic";

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

function formatQualityLabel(value: "high_signal" | "coverage") {
  return value === "high_signal" ? "High-signal" : "Coverage";
}

function formatStatusLabel(value: "connected" | "degraded" | "not_configured") {
  return value === "connected"
    ? "Connected"
    : value === "degraded"
      ? "Needs attention"
      : "Not configured";
}

export default async function JobsPage() {
  const snapshot = await getJobsFeedSnapshot({ limit: 9 });
  const environmentGuide = getJobsEnvironmentGuide();
  const directSources = snapshot.sources.filter((source) => source.lane === "ats_direct");
  const coverageSources = snapshot.sources.filter((source) => source.lane === "aggregator");

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Hybrid Job Intake</span>
            <h1 className={styles.title}>
              ATS-direct quality plus aggregator volume, merged into one hiring surface.
            </h1>
            <p className={styles.subtitle}>
              Career AI now treats job sourcing like a two-lane system: direct ATS feeds for
              cleaner, recruiter-grade openings and an aggregator feed for immediate market
              coverage. The stack below shows what is connected, what is live, and what still
              needs credentials.
            </p>

            <div className={styles.statusRow}>
              <div className={styles.statusPill}>
                <TowerControl aria-hidden="true" size={18} strokeWidth={2} />
                <span>{snapshot.summary.connectedSourceCount} live sources</span>
              </div>
              <div className={styles.statusPill}>
                <Compass aria-hidden="true" size={18} strokeWidth={2} />
                <span>{snapshot.summary.directAtsJobs} ATS-direct jobs in view</span>
              </div>
              <div className={styles.statusPill}>
                <Radar aria-hidden="true" size={18} strokeWidth={2} />
                <span>{snapshot.summary.aggregatorJobs} coverage jobs in view</span>
              </div>
            </div>
          </div>

          <aside className={styles.heroPanel}>
            <div className={styles.panelBadge}>
              <BriefcaseBusiness aria-hidden="true" size={18} strokeWidth={2} />
              <span>Pipeline mix</span>
            </div>
            <h2>{snapshot.summary.totalJobs} deduped jobs are in the current merged window.</h2>
            <p>
              Direct ATS lanes stay closest to the source, while the coverage lane makes the page
              useful immediately. As more feeds are connected, this becomes the matching cockpit
              for verified candidates and role pipelines.
            </p>
            <Link className={styles.inlineLink} href="/agent-build">
              Open Agent Builder
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </aside>
        </section>

        <section className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <span className={styles.cardEyebrow}>Source count</span>
            <strong>{snapshot.summary.sourceCount}</strong>
            <p>Configured and pending sources across direct ATS and aggregator lanes.</p>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.cardEyebrow}>High-signal lane</span>
            <strong>{snapshot.summary.highSignalSourceCount}</strong>
            <p>Direct ATS sources built for cleaner, higher-trust openings.</p>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.cardEyebrow}>Coverage lane</span>
            <strong>{snapshot.summary.coverageSourceCount}</strong>
            <p>Aggregator capacity that expands job volume without blocking the rollout.</p>
          </article>
        </section>

        <section className={styles.pipelineGrid}>
          <article className={styles.pipelinePanel}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Lane one</span>
                <h2>ATS direct feeds</h2>
              </div>
              <span className={styles.sectionCount}>{directSources.length} sources</span>
            </div>
            <div className={styles.sourceList}>
              {directSources.map((source) => (
                <article className={styles.sourceCard} key={source.key}>
                  <div className={styles.sourceHeader}>
                    <div>
                      <h3>{source.label}</h3>
                      <p>{source.endpointLabel ?? "Awaiting provider config"}</p>
                    </div>
                    <div className={styles.badgeRow}>
                      <span className={styles.qualityBadge}>{formatQualityLabel(source.quality)}</span>
                      <span
                        className={`${styles.statusBadge} ${
                          source.status === "connected"
                            ? styles.statusConnected
                            : source.status === "degraded"
                              ? styles.statusDegraded
                              : styles.statusPending
                        }`}
                      >
                        {formatStatusLabel(source.status)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.sourceMetaRow}>
                    <span>{source.jobCount} jobs surfaced</span>
                    <span>{formatLaneLabel(source.lane)}</span>
                  </div>
                  <p className={styles.sourceMessage}>{source.message}</p>
                </article>
              ))}
            </div>
          </article>

          <article className={styles.pipelinePanel}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Lane two</span>
                <h2>Coverage aggregator</h2>
              </div>
              <span className={styles.sectionCount}>{coverageSources.length} sources</span>
            </div>
            <div className={styles.sourceList}>
              {coverageSources.map((source) => (
                <article className={styles.sourceCard} key={source.key}>
                  <div className={styles.sourceHeader}>
                    <div>
                      <h3>{source.label}</h3>
                      <p>{source.endpointLabel ?? "Awaiting provider config"}</p>
                    </div>
                    <div className={styles.badgeRow}>
                      <span className={styles.qualityBadge}>{formatQualityLabel(source.quality)}</span>
                      <span
                        className={`${styles.statusBadge} ${
                          source.status === "connected"
                            ? styles.statusConnected
                            : source.status === "degraded"
                              ? styles.statusDegraded
                              : styles.statusPending
                        }`}
                      >
                        {formatStatusLabel(source.status)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.sourceMetaRow}>
                    <span>{source.jobCount} jobs surfaced</span>
                    <span>{formatLaneLabel(source.lane)}</span>
                  </div>
                  <p className={styles.sourceMessage}>{source.message}</p>
                </article>
              ))}
            </div>
          </article>
        </section>

        <section className={styles.jobsPanel}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Merged feed window</span>
              <h2>Live roles in the intake stack</h2>
            </div>
            <span className={styles.sectionCount}>{snapshot.jobs.length} roles shown</span>
          </div>

          {snapshot.jobs.length > 0 ? (
            <div className={styles.jobsGrid}>
              {snapshot.jobs.map((job) => (
                <article className={styles.jobCard} key={job.id}>
                  <div className={styles.badgeRow}>
                    <span className={styles.laneBadge}>{formatLaneLabel(job.sourceLane)}</span>
                    <span className={styles.qualityBadge}>{formatQualityLabel(job.sourceQuality)}</span>
                  </div>
                  <div className={styles.jobCopy}>
                    <div>
                      <span className={styles.cardEyebrow}>{job.companyName}</span>
                      <h3>{job.title}</h3>
                    </div>
                    <p>
                      {[job.location, job.department, job.commitment].filter(Boolean).join(" • ") ||
                        "Location and team details are still loading from the source."}
                    </p>
                  </div>
                  {job.descriptionSnippet ? (
                    <p className={styles.jobSnippet}>{job.descriptionSnippet}</p>
                  ) : null}
                  <div className={styles.jobFooter}>
                    <span>{job.sourceLabel}</span>
                    <span>{formatTimestamp(job.updatedAt || job.postedAt)}</span>
                  </div>
                  <a
                    className={styles.jobLink}
                    href={job.applyUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open posting
                    <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <article className={styles.emptyState}>
              <div className={styles.emptyBadge}>
                <Sparkles aria-hidden="true" size={18} strokeWidth={2} />
                <span>Next connection steps</span>
              </div>
              <h3>No job feeds are connected yet.</h3>
              <p>
                The hybrid intake layer is live, but it needs at least one ATS feed or one
                aggregator endpoint to start filling the jobs surface. Add any of these environment
                variables to activate the stack.
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
      </div>
    </main>
  );
}
