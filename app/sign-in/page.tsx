import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

        <GoogleSignInButton callbackUrl="/account" label="Sign in with Google" />

        <div className={styles.noteCard}>
          <strong>Google sign-in runs through our server-side OAuth flow.</strong>
          <p>
            The Google client secret stays on the server. If sign-in is unavailable here, this environment still
            needs the backend OAuth credentials or callback URL configured correctly.
          </p>
        </div>
      </section>
    </main>
  );
}
