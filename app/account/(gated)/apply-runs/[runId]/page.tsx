import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPersonaSignInRoute } from "@/lib/personas";
import {
  findApplyRunById,
  isDatabaseConfigured,
  listApplyRunEvents,
} from "@/packages/persistence/src";
import styles from "@/components/access-requests/access-request-workflow.module.css";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ApplyRunDetailPage(props: {
  params: Promise<{
    runId: string;
  }>;
}) {
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
    notFound();
  }

  const params = await props.params;
  const run = await findApplyRunById({
    runId: params.runId,
  }).catch(() => null);

  if (!run || run.userId !== session.user.appUserId) {
    notFound();
  }

  const events = await listApplyRunEvents({
    runId: run.id,
  });

  return (
    <main className={styles.page}>
      <div className={styles.pageShell}>
        <section className={styles.pageHero}>
          <span className={styles.eyebrow}>Autonomous apply</span>
          <h1>{run.jobTitle}</h1>
          <p className={styles.lead}>
            {run.companyName} · Run ID: {run.id}
          </p>
          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/account/apply-runs">
              Back to run list
            </Link>
          </div>
        </section>

        <section className={styles.card}>
          <h2>Run status</h2>
          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Status</span>
              <span className={styles.metaValue}>{run.status}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Terminal state</span>
              <span className={styles.metaValue}>{run.terminalState ?? "In progress"}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Failure code</span>
              <span className={styles.metaValue}>{run.failureCode ?? "None"}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Trace ID</span>
              <span className={styles.metaValue}>{run.traceId ?? "Unavailable"}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Created</span>
              <span className={styles.metaValue}>{formatTimestamp(run.createdAt)}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Started</span>
              <span className={styles.metaValue}>{formatTimestamp(run.startedAt)}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Completed</span>
              <span className={styles.metaValue}>{formatTimestamp(run.completedAt)}</span>
            </div>
          </div>
          {run.failureMessage ? <p className={styles.muted}>{run.failureMessage}</p> : null}
        </section>

        <section className={styles.card}>
          <h2>Event timeline</h2>
          {events.length === 0 ? (
            <p className={styles.muted}>No events recorded yet.</p>
          ) : (
            <ul className={styles.list}>
              {events.map((event) => (
                <li className={styles.listItem} key={event.id}>
                  <div className={styles.listHeader}>
                    <strong>{event.eventType}</strong>
                    <span className={`${styles.pill} ${styles.pillPending}`}>{event.state}</span>
                  </div>
                  <p className={styles.muted}>{event.message ?? "No message captured."}</p>
                  <p className={styles.muted}>
                    {formatTimestamp(event.timestamp)} · {event.stepName ?? "unspecified_step"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
