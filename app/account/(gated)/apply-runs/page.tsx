import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPersonaSignInRoute } from "@/lib/personas";
import {
  isDatabaseConfigured,
  listApplyRunEventSummariesByRunIds,
  listApplyRunsByUser,
} from "@/packages/persistence/src";
import styles from "@/components/access-requests/access-request-workflow.module.css";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toStatusLabel(status: string, terminalState: string | null) {
  if (terminalState === "submitted") {
    return "Submitted";
  }

  if (terminalState === "submission_unconfirmed") {
    return "Unconfirmed";
  }

  if (terminalState === "needs_attention") {
    return "Needs attention";
  }

  if (terminalState === "failed") {
    return "Failed";
  }

  if (status === "queued") {
    return "Queued";
  }

  return "Running";
}

function toStatusClassName(status: string, terminalState: string | null) {
  if (terminalState === "submitted") {
    return styles.pillGranted;
  }

  if (
    terminalState === "failed" ||
    terminalState === "needs_attention" ||
    terminalState === "submission_unconfirmed"
  ) {
    return styles.pillRejected;
  }

  if (status === "queued") {
    return styles.pillPending;
  }

  return styles.pillExpired;
}

export default async function ApplyRunsPage() {
  const session = await auth();

  if (!session?.user?.email || !session.user.appUserId) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: "/account/apply-runs",
        persona: "job_seeker",
      }),
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <main className={styles.page}>
        <div className={styles.pageShell}>
          <section className={styles.pageHero}>
            <span className={styles.eyebrow}>Autonomous apply</span>
            <h1>Application run status</h1>
            <p className={styles.lead}>
              Apply run status requires database-backed persistence in this environment.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const runs = await listApplyRunsByUser({
    limit: 20,
    userId: session.user.appUserId,
  });
  const summaries = await listApplyRunEventSummariesByRunIds({
    runIds: runs.map((run) => run.id),
  });
  const summaryByRunId = new Map(summaries.map((entry) => [entry.runId, entry]));

  return (
    <main className={styles.page}>
      <div className={styles.pageShell}>
        <section className={styles.pageHero}>
          <span className={styles.eyebrow}>Autonomous apply</span>
          <h1>Application run status</h1>
          <p className={styles.lead}>
            Review your recent one-click Workday application runs and open each run for a full
            event timeline.
          </p>
        </section>

        <section className={styles.card}>
          {runs.length === 0 ? (
            <p className={styles.muted}>
              No autonomous apply runs yet. Start from the Jobs page and this status panel will
              show queued and completed runs.
            </p>
          ) : (
            <ul className={styles.list}>
              {runs.map((run) => {
                const summary = summaryByRunId.get(run.id);

                return (
                  <li className={styles.listItem} key={run.id}>
                    <div className={styles.listHeader}>
                      <div>
                        <strong>{run.jobTitle}</strong>
                        <p className={styles.muted}>{run.companyName}</p>
                      </div>
                      <span className={`${styles.pill} ${toStatusClassName(run.status, run.terminalState)}`}>
                        {toStatusLabel(run.status, run.terminalState)}
                      </span>
                    </div>

                    <div className={styles.metaGrid}>
                      <div className={styles.metaCard}>
                        <span className={styles.metaLabel}>Created</span>
                        <span className={styles.metaValue}>{formatTimestamp(run.createdAt)}</span>
                      </div>
                      <div className={styles.metaCard}>
                        <span className={styles.metaLabel}>Completed</span>
                        <span className={styles.metaValue}>{formatTimestamp(run.completedAt)}</span>
                      </div>
                      <div className={styles.metaCard}>
                        <span className={styles.metaLabel}>Latest event</span>
                        <span className={styles.metaValue}>
                          {summary?.latestEventType ?? "No events yet"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.actions}>
                      <Link className={styles.secondaryButton} href={`/account/apply-runs/${run.id}`}>
                        View run details
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
