import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccessRequestReviewActions } from "@/components/access-requests/access-request-review-actions";
import styles from "@/components/access-requests/access-request-workflow.module.css";
import { getPersonaSignInRoute } from "@/lib/personas";
import { resolveSessionAuthenticatedActor } from "@/packages/audit-security/src";
import { ApiError } from "@/packages/contracts/src";
import { getAccessRequestReview } from "@/packages/access-request-domain/src";

type AccessRequestReviewPageProps = {
  params: Promise<{
    requestId: string;
  }>;
  searchParams?: Promise<{
    token?: string;
  }>;
};

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatScopeLabel(value: string) {
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

export default async function AccessRequestReviewPage({
  params,
  searchParams,
}: AccessRequestReviewPageProps) {
  const { requestId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const token = resolvedSearchParams.token?.trim() || null;
  const session = await auth();
  const sessionActor = resolveSessionAuthenticatedActor(session?.user);

  if (!sessionActor && !token) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: `/access-requests/${requestId}`,
        persona: "job_seeker",
      }),
    );
  }

  try {
    const review = await getAccessRequestReview({
      correlationId: `access_request_review_page_${requestId}`,
      requestId,
      reviewTokenOptional: token,
      sessionActorOptional: sessionActor,
    });
    const displayStatus = getDisplayStatusLabel({
      grantLifecycleStatusOptional: review.grantLifecycleStatusOptional,
      requestStatus: review.status,
    });
    const canRevoke =
      sessionActor?.actorType === "talent_user" &&
      sessionActor.actorId === review.subject.talentIdentityId;

    return (
      <main className={styles.page}>
        <div className={[styles.pageShell, styles.pageShellHeaderOffset].join(" ")}>
          <section className={styles.pageHero}>
            <span className={styles.eyebrow}>Secure review</span>
            <h1>Review Career ID access request</h1>
            <p className={styles.lead}>
              All channels route back to this secure page. Approving or rejecting here creates a
              durable audit trail and updates recruiter access immediately.
            </p>
          </section>

          <section className={styles.card}>
            <div className={styles.stack}>
              <div className={styles.listHeader}>
                <div>
                  <h2>{review.requester.organizationName}</h2>
                  <p className={styles.smallNote}>
                    Requested by {review.requester.requesterName}
                  </p>
                </div>
                <span className={[styles.pill, getStatusPillClass(displayStatus)].join(" ")}>
                  {formatStatusLabel(displayStatus)}
                </span>
              </div>

              <div className={styles.metaGrid}>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Requested scope</span>
                  <strong className={styles.metaValue}>{formatScopeLabel(review.scope)}</strong>
                </article>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Reason</span>
                  <strong className={styles.metaValue}>{review.justification}</strong>
                </article>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Requested duration</span>
                  <strong className={styles.metaValue}>
                    {review.requestedDurationDaysOptional
                      ? `${review.requestedDurationDaysOptional} days`
                      : "No expiration requested"}
                  </strong>
                </article>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Review channel</span>
                  <strong className={styles.metaValue}>
                    {review.reviewAccess.channel.replaceAll("_", " ")}
                  </strong>
                </article>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Access lifecycle</span>
                  <strong className={styles.metaValue}>{formatStatusLabel(displayStatus)}</strong>
                </article>
              </div>

              {review.status === "granted" && review.grantLifecycleStatusOptional === "active" ? (
                <p className={styles.statusMessage + " " + styles.statusMessageSuccess}>
                  Access approved.
                  {review.grantedExpiresAtOptional
                    ? ` The current grant expires at ${review.grantedExpiresAtOptional}.`
                    : " The current grant does not have an expiration."}
                </p>
              ) : null}

              {review.status === "granted" && review.grantLifecycleStatusOptional === "revoked" ? (
                <p className={styles.statusMessage + " " + styles.statusMessageError}>
                  Access was revoked
                  {review.grantRevokedAtOptional ? ` at ${review.grantRevokedAtOptional}.` : "."}
                </p>
              ) : null}

              {review.status === "granted" && review.grantLifecycleStatusOptional === "expired" ? (
                <p className={styles.statusMessage + " " + styles.statusMessageError}>
                  Access expired
                  {review.grantedExpiresAtOptional
                    ? ` at ${review.grantedExpiresAtOptional}.`
                    : "."}
                </p>
              ) : null}

              {review.status === "rejected" ? (
                <p className={styles.statusMessage + " " + styles.statusMessageError}>
                  This request has already been rejected.
                </p>
              ) : null}
            </div>
          </section>

          <AccessRequestReviewActions
            canRevoke={canRevoke}
            request={review}
            reviewTokenOptional={token}
          />

          <div className={styles.actions}>
            <Link className={styles.secondaryButton} href="/account/access-requests">
              Back to inbox
            </Link>
          </div>
        </div>
      </main>
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : "We couldn't verify that review link.";

    return (
      <main className={styles.page}>
        <div className={[styles.pageShell, styles.pageShellHeaderOffset].join(" ")}>
          <section className={styles.card}>
            <div className={styles.stack}>
              <span className={styles.eyebrow}>Review unavailable</span>
              <h1>We couldn't open this secure request</h1>
              <p className={styles.lead}>{message}</p>
              <div className={styles.actions}>
                <Link className={styles.secondaryButton} href="/account/access-requests">
                  Open candidate inbox
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }
}
