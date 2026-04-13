import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPersonaSignInRoute } from "@/lib/personas";
import { resolveSessionAuthenticatedActor } from "@/packages/audit-security/src";
import { listCandidateAccessRequests } from "@/packages/access-request-domain/src";
import styles from "@/components/access-requests/access-request-workflow.module.css";

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getStatusPillClass(status: string) {
  if (status === "granted") {
    return styles.pillGranted;
  }

  if (status === "rejected") {
    return styles.pillRejected;
  }

  return styles.pillPending;
}

export default async function AccountAccessRequestsPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: "/account/access-requests",
        persona: "job_seeker",
      }),
    );
  }

  const actor = resolveSessionAuthenticatedActor(session.user);

  if (!actor) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: "/account/access-requests",
        persona: "job_seeker",
      }),
    );
  }

  const accessRequests = await listCandidateAccessRequests({
    actor,
    correlationId: `account_access_requests_${actor.actorId}`,
  });
  const pending = accessRequests.items.filter((item) => item.status === "pending");
  const history = accessRequests.items.filter((item) => item.status !== "pending");

  return (
    <main className={styles.page}>
      <div className={styles.pageShell}>
        <section className={styles.pageHero}>
          <span className={styles.eyebrow}>Candidate inbox</span>
          <h1>Career ID access requests</h1>
          <p className={styles.lead}>
            Review recruiter requests in one place. Email and optional SMS links open the same
            secure approval page you see here in-app.
          </p>
        </section>

        <section className={styles.card}>
          <div className={styles.stack}>
            <h2>Pending requests</h2>
            {pending.length === 0 ? (
              <p className={styles.emptyState}>
                No recruiter is waiting on a Career ID access decision right now.
              </p>
            ) : (
              <ul className={styles.list}>
                {pending.map((item) => (
                  <li className={styles.listItem} key={item.id}>
                    <div className={styles.listHeader}>
                      <strong>{item.requester.organizationName}</strong>
                      <span className={[styles.pill, getStatusPillClass(item.status)].join(" ")}>
                        {formatStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className={styles.muted}>
                      {item.requester.requesterName} is requesting{" "}
                      {item.scope.replaceAll("_", " ")} access.
                    </p>
                    <p className={styles.smallNote}>
                      Reason: {item.justification}
                      {"  "}Requested duration:{" "}
                      {item.requestedDurationDaysOptional
                        ? `${item.requestedDurationDaysOptional} days`
                        : "No expiration requested"}
                    </p>
                    <div className={styles.actions}>
                      <Link className={styles.primaryButton} href={item.reviewPath}>
                        Review securely
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.stack}>
            <h2>Recent decisions</h2>
            {history.length === 0 ? (
              <p className={styles.emptyState}>
                Approved and rejected requests will appear here after you act on them.
              </p>
            ) : (
              <ul className={styles.list}>
                {history.map((item) => (
                  <li className={styles.listItem} key={item.id}>
                    <div className={styles.listHeader}>
                      <strong>{item.requester.organizationName}</strong>
                      <span className={[styles.pill, getStatusPillClass(item.status)].join(" ")}>
                        {formatStatusLabel(item.status)}
                      </span>
                    </div>
                    <p className={styles.muted}>{item.justification}</p>
                    <div className={styles.actions}>
                      <Link className={styles.secondaryButton} href={item.reviewPath}>
                        Open request
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
