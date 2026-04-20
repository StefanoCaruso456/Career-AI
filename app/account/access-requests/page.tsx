import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPersonaSignInRoute } from "@/lib/personas";
import { resolveSessionAuthenticatedActor } from "@/packages/audit-security/src";
import { listCandidateAccessRequests } from "@/packages/access-request-domain/src";
import styles from "@/components/access-requests/access-request-workflow.module.css";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getDisplayStatusLabel(args: {
  grantLifecycleStatusOptional: string | null;
  requestStatus: string;
}) {
  if (args.requestStatus === "granted" && args.grantLifecycleStatusOptional) {
    return args.grantLifecycleStatusOptional;
  }

  return args.requestStatus;
}

function getStatusPillClass(status: string) {
  if (status === "granted" || status === "active") {
    return styles.pillGranted;
  }

  if (status === "rejected" || status === "revoked") {
    return styles.pillRejected;
  }

  if (status === "expired") {
    return styles.pillExpired;
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
  const activeGrants = accessRequests.items.filter(
    (item) => item.status === "granted" && item.grantLifecycleStatusOptional === "active",
  );
  const history = accessRequests.items.filter(
    (item) =>
      item.status !== "pending" &&
      !(item.status === "granted" && item.grantLifecycleStatusOptional === "active"),
  );
  const activeGrantCount = activeGrants.length;
  const pendingRequestCount = pending.length;
  const activeGrantLabelText = activeGrantCount === 1 ? "active grant" : "active grants";
  const pendingRequestLabelText =
    pendingRequestCount === 1 ? "pending request" : "pending requests";
  const activeGrantLabel = `${formatCount(activeGrantCount)} ${activeGrantLabelText}`;
  const pendingRequestLabel = `${formatCount(pendingRequestCount)} ${pendingRequestLabelText}`;

  return (
    <main className={styles.page}>
      <div className={styles.pageShell}>
        <section className={styles.pageHero}>
          <div className={styles.pageHeroHeader}>
            <div className={styles.pageHeroCopy}>
              <span className={styles.eyebrow}>Candidate inbox</span>
              <h1>Career ID access requests</h1>
              <p className={styles.lead}>
                Review recruiter requests in one place. Email and optional SMS links open the same
                secure approval page you see here in-app.
              </p>
            </div>

            <div aria-label="Access request overview" className={styles.metricPillRow}>
              <div
                aria-label={activeGrantLabel}
                className={[styles.metricPill, styles.metricPillActive].join(" ")}
              >
                <strong className={styles.metricPillValue}>{formatCount(activeGrantCount)}</strong>
                <span className={styles.metricPillLabel}>{activeGrantLabelText}</span>
              </div>
              <div
                aria-label={pendingRequestLabel}
                className={[styles.metricPill, styles.metricPillPending].join(" ")}
              >
                <strong className={styles.metricPillValue}>{formatCount(pendingRequestCount)}</strong>
                <span className={styles.metricPillLabel}>{pendingRequestLabelText}</span>
              </div>
            </div>
          </div>
        </section>

        {activeGrantCount > 0 ? (
          <section className={[styles.card, styles.accountSection].join(" ")}>
            <div className={styles.stack}>
              <h2>Active grants</h2>
              <ul className={styles.list}>
                {activeGrants.map((item) => (
                  <li className={styles.listItem} key={item.id}>
                    <div className={styles.listHeader}>
                      <strong>{item.requester.organizationName}</strong>
                      <span className={[styles.pill, getStatusPillClass("active")].join(" ")}>
                        Active
                      </span>
                    </div>
                    <p className={styles.muted}>
                      {item.requester.requesterName} currently has {item.scope.replaceAll("_", " ")} access.
                    </p>
                    <p className={styles.smallNote}>
                      {item.grantedExpiresAtOptional
                        ? `Grant expires at ${item.grantedExpiresAtOptional}.`
                        : "Grant does not expire automatically."}
                    </p>
                    <div className={styles.actions}>
                      <Link className={styles.secondaryButton} href={item.reviewPath}>
                        Manage grant
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {pendingRequestCount > 0 ? (
          <section className={[styles.card, styles.accountSection].join(" ")}>
            <div className={styles.stack}>
              <h2>Pending requests</h2>
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
            </div>
          </section>
        ) : null}

        <section className={[styles.card, styles.accountSection].join(" ")}>
          <div className={styles.stack}>
            <h2>Recent decisions</h2>
            {history.length === 0 ? (
              <p className={styles.emptyState}>
                Approved and rejected requests will appear here after you act on them.
              </p>
            ) : (
              <ul className={styles.list}>
                {history.map((item) => (
                  (() => {
                    const displayStatus = getDisplayStatusLabel({
                      grantLifecycleStatusOptional: item.grantLifecycleStatusOptional,
                      requestStatus: item.status,
                    });

                    return (
                      <li className={styles.listItem} key={item.id}>
                        <div className={styles.listHeader}>
                          <strong>{item.requester.organizationName}</strong>
                          <span className={[styles.pill, getStatusPillClass(displayStatus)].join(" ")}>
                            {formatStatusLabel(displayStatus)}
                          </span>
                        </div>
                        <p className={styles.muted}>{item.justification}</p>
                        {item.status === "granted" && item.grantLifecycleStatusOptional === "revoked" ? (
                          <p className={styles.smallNote}>
                            Access was revoked
                            {item.grantRevokedAtOptional ? ` at ${item.grantRevokedAtOptional}.` : "."}
                          </p>
                        ) : null}
                        {item.status === "granted" && item.grantLifecycleStatusOptional === "expired" ? (
                          <p className={styles.smallNote}>
                            Access expired
                            {item.grantedExpiresAtOptional
                              ? ` at ${item.grantedExpiresAtOptional}.`
                              : "."}
                          </p>
                        ) : null}
                        <div className={styles.actions}>
                          <Link className={styles.secondaryButton} href={item.reviewPath}>
                            Open request
                          </Link>
                        </div>
                      </li>
                    );
                  })()
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
