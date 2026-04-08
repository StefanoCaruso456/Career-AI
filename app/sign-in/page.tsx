import { redirect } from "next/navigation";
import { googleOAuthEnabled, auth } from "@/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import styles from "./page.module.css";

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/account");
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.eyebrow}>Google OAuth</div>
        <h1 className={styles.title}>Connect your Talent Agent ID with Google</h1>
        <p className={styles.copy}>
          Use your Google account to access the private account workspace, keep your
          session active across the app, and make the Railway deployment ready for real
          sign-in traffic.
        </p>

        {googleOAuthEnabled ? (
          <>
            <GoogleSignInButton callbackUrl="/account" />
            <p className={styles.small}>
              After authentication, you will land in your account workspace at
              <code> /account</code>.
            </p>
          </>
        ) : (
          <div className={styles.warning}>
            <strong>Google OAuth is not configured yet.</strong>
            <p>
              Add <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>,
              <code> NEXTAUTH_URL</code>, and <code>NEXTAUTH_SECRET</code> in Railway
              and in your local <code>.env.local</code>.
            </p>
          </div>
        )}

        <div className={styles.configBlock}>
          <h2>Google Cloud values</h2>
          <div className={styles.valueRow}>
            <span>Authorized JavaScript origin</span>
            <code>https://taidai-production.up.railway.app</code>
          </div>
          <div className={styles.valueRow}>
            <span>Authorized redirect URI</span>
            <code>https://taidai-production.up.railway.app/api/auth/callback/google</code>
          </div>
          <div className={styles.valueRow}>
            <span>Local redirect URI</span>
            <code>http://localhost:3000/api/auth/callback/google</code>
          </div>
        </div>
      </section>
    </main>
  );
}
