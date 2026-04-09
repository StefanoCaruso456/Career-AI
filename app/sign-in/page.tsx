import { redirect } from "next/navigation";
import { auth, googleOAuthDisabledMessage, googleOAuthEnabled } from "@/auth";
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
        <div className={styles.eyebrow}>Verified access</div>
        <h1 className={styles.title}>Sign in to your Career AI workspace</h1>
        <p className={styles.copy}>
          Use Google to verify your email, restore your session, and step straight into
          your protected Career AI workspace.
        </p>

        <GoogleSignInButton
          callbackUrl="/account"
          disabled={!googleOAuthEnabled}
          disabledLabel="Google sign-in unavailable"
          disabledTitle={
            googleOAuthEnabled
              ? undefined
              : googleOAuthDisabledMessage
          }
          label="Sign in with Google"
        />

        <div className={styles.noteCard}>
          <strong>
            {googleOAuthEnabled
              ? "Google sign-in runs through our server-side OAuth flow."
              : "Google sign-in is disabled locally."}
          </strong>
          <p>
            {googleOAuthEnabled
              ? "After authentication, you will land in your account workspace at /account."
              : `${googleOAuthDisabledMessage} The Google client secret stays on the server.`}
          </p>
        </div>
      </section>
    </main>
  );
}
