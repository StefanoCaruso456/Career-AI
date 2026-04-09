import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { auth } from "@/auth";
import { ensureTalentIdentityForSessionUser } from "@/auth-identity";
import styles from "./page.module.css";

function getFallbackName(name: string | null | undefined, email: string | null | undefined) {
  if (name?.trim()) {
    return name.trim();
  }

  if (email?.trim()) {
    return email.split("@")[0];
  }

  return "Verified user";
}

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/sign-in");
  }

  const aggregate = ensureTalentIdentityForSessionUser({
    user: {
      email: session.user.email,
      name: session.user.name,
    },
    correlationId: `account_page_${session.user.email ?? "unknown"}`,
  });
  const displayName = getFallbackName(session.user.name, session.user.email);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.identityBlock}>
            <div className={styles.avatarShell}>
              {session.user.image ? (
                <Image
                  alt={`${displayName} profile image`}
                  className={styles.avatar}
                  height={88}
                  src={session.user.image}
                  width={88}
                />
              ) : (
                <div className={styles.avatarFallback}>
                  <UserRound aria-hidden="true" size={38} strokeWidth={1.8} />
                </div>
              )}
            </div>

            <div className={styles.identityCopy}>
              <span className={styles.eyebrow}>Authenticated workspace</span>
              <h1 className={styles.title}>{displayName}</h1>
              <p className={styles.subtitle}>
                Google sign-in now provisions your Career AI identity automatically, so the
                OAuth callback, session cookie, and identity record are all working together.
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
              <span>Email verified by Google</span>
            </div>
            <div className={styles.statusRow}>
              <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
              <span>Career AI identity provisioned</span>
            </div>
          </div>
        </section>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <h2>Session snapshot</h2>
            <dl className={styles.details}>
              <div>
                <dt>Name</dt>
                <dd>{displayName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{session.user.email ?? "Not returned by provider"}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>Google OAuth</dd>
              </div>
              <div>
                <dt>Talent identity ID</dt>
                <dd>{aggregate.talentIdentity.id}</dd>
              </div>
              <div>
                <dt>Talent Agent ID</dt>
                <dd>{aggregate.talentIdentity.talent_agent_id}</dd>
              </div>
              <div>
                <dt>Soul record ID</dt>
                <dd>{aggregate.soulRecord.id}</dd>
              </div>
            </dl>
          </article>

          <article className={styles.panel}>
            <h2>Backend handoff</h2>
            <ul className={styles.list}>
              <li>Your verified Google session now maps to a Career AI talent identity record.</li>
              <li>Session-backed identity details are available at <code>/api/v1/me/talent-identity</code>.</li>
              <li>Next protected flows can rely on the provisioned talent identity and soul record IDs.</li>
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
}
