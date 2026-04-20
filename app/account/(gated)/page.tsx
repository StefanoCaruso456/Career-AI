import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { auth } from "@/auth";
import {
  ensurePersistentCareerIdentityForSessionUser,
  getDisplayNameForContext,
} from "@/auth-identity";
import { getPersonaSignInRoute } from "@/lib/personas";
import styles from "../page.module.css";

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function RecoveryState({
  body,
  title,
}: {
  body: string;
  title: string;
}) {
  const signInHref = getPersonaSignInRoute({
    callbackUrl: "/account",
    persona: "job_seeker",
  });

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.panel}>
          <span className={styles.eyebrow}>Career workspace</span>
          <h1 className={styles.sectionTitle}>{title}</h1>
          <p className={styles.sectionCopy}>{body}</p>
          <div className={styles.recoveryActions}>
            <Link className={styles.inlineLink} href="/jobs">
              Browse jobs
              <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
            <Link className={styles.secondaryLink} href={signInHref} prefetch={false}>
              Sign in again
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <RecoveryState
        body="We could not confirm your account session on this request. Use the sign-in link to re-open your workspace cleanly."
        title="We need to re-check your account session"
      />
    );
  }

  try {
    const { context } = await ensurePersistentCareerIdentityForSessionUser({
      user: {
        appUserId: session.user.appUserId,
        authProvider: session.user.authProvider,
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        providerUserId: session.user.providerUserId,
      },
      correlationId: `account_page_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
    });

    const displayName = getDisplayNameForContext(context);

    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <div className={styles.identityBlock}>
              <div className={styles.avatarShell}>
                {context.user.imageUrl ? (
                  <Image
                    alt={`${displayName} profile image`}
                    className={styles.avatar}
                    height={88}
                    src={context.user.imageUrl}
                    width={88}
                  />
                ) : (
                  <div className={styles.avatarFallback}>
                    <UserRound aria-hidden="true" size={38} strokeWidth={1.8} />
                  </div>
                )}
              </div>

              <div className={styles.identityCopy}>
                <span className={styles.eyebrow}>Persistent account</span>
                <h1 className={styles.title}>{displayName}</h1>
                <p className={styles.subtitle}>
                  Your Google session now resolves to a durable Railway Postgres user
                  record, a linked Career AI identity, and a completed onboarding state.
                </p>
              </div>
            </div>

            <div className={styles.statusCard}>
              <div className={styles.statusRow}>
                <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
                <span>Google session active</span>
              </div>
              <div className={styles.statusRow}>
                <ShieldCheck aria-hidden="true" size={18} strokeWidth={2} />
                <span>Postgres-backed identity active</span>
              </div>
              <div className={styles.statusRow}>
                <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
                <span>Onboarding completed and persisted</span>
              </div>
            </div>
          </section>

          <section className={styles.grid}>
            <article className={styles.panel}>
              <h2>Persistent profile</h2>
              <dl className={styles.details}>
                <div>
                  <dt>Name</dt>
                  <dd>{context.user.fullName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{context.user.email}</dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{context.user.authProvider}</dd>
                </div>
                <div>
                  <dt>Last login</dt>
                  <dd>{formatTimestamp(context.user.lastLoginAt)}</dd>
                </div>
                <div>
                  <dt>Talent identity ID</dt>
                  <dd>{context.aggregate.talentIdentity.id}</dd>
                </div>
                <div>
                  <dt>Talent Agent ID</dt>
                  <dd>{context.aggregate.talentIdentity.talent_agent_id}</dd>
                </div>
                <div>
                  <dt>Soul record ID</dt>
                  <dd>{context.aggregate.soulRecord.id}</dd>
                </div>
              </dl>
            </article>

            <article className={styles.panel}>
              <h2>Onboarding state</h2>
              <ul className={styles.list}>
                <li>Status: {context.onboarding.status}</li>
                <li>Profile completion: {context.onboarding.profileCompletionPercent}%</li>
                <li>Role type: {context.onboarding.roleType ?? "Not selected"}</li>
                <li>
                  Career intent:{" "}
                  {typeof context.onboarding.profile.intent === "string"
                    ? context.onboarding.profile.intent
                    : "Not provided"}
                </li>
              </ul>
              <Link className={styles.inlineLink} href="/">
                Return to homepage
                <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
              </Link>
            </article>
          </section>
        </div>
      </main>
    );
  } catch {
    return (
      <RecoveryState
        body="Your header session loaded, but the workspace overview could not finish loading. Refresh once, and if it still happens, sign in again to rehydrate the account route."
        title="We could not load your account overview right now"
      />
    );
  }
}
