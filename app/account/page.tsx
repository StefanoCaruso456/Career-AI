import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { auth } from "@/auth";
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
                Google sign-in is live on the Railway deployment. This protected page confirms
                the OAuth callback, session cookie, and account routing are working together.
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
            </dl>
          </article>

          <article className={styles.panel}>
            <h2>Recommended next steps</h2>
            <ul className={styles.list}>
              <li>Store your Google client credentials in Railway production variables.</li>
              <li>Restrict access to future talent or recruiter flows using this session.</li>
              <li>Connect the authenticated user to a persistent Talent Agent ID record.</li>
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
