import { redirect } from "next/navigation";
import { googleOAuthEnabled, googleRedirectUri, publicOrigin, auth } from "@/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import styles from "./page.module.css";

export default async function SignInPage() {
  const session = await auth();
  const productionOrigin = publicOrigin || "https://taidai-production.up.railway.app";
  const productionRedirectUri =
    googleRedirectUri || "https://taidai-production.up.railway.app/api/auth/callback/google";

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
              Add <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> or
              the Railway variable names you already created: <code>CLIENT_ID</code> /
              <code>CLIENT_SECRET</code>.
            </p>
            <p>
              You also need <code>NEXTAUTH_SECRET</code>. If Railway exposes
              <code> RAILWAY_PUBLIC_DOMAIN</code>, the app can derive
              <code> NEXTAUTH_URL</code> from it automatically.
            </p>
          </div>
        )}

        <div className={styles.configBlock}>
          <h2>Google Cloud values</h2>
          <div className={styles.valueRow}>
            <span>Authorized JavaScript origin</span>
            <code>{productionOrigin}</code>
          </div>
          <div className={styles.valueRow}>
            <span>Authorized redirect URI</span>
            <code>{productionRedirectUri}</code>
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
