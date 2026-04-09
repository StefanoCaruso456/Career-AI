import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleSignInPanel } from "@/components/google-sign-in-panel";
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
        <GoogleSignInPanel />
      </section>
    </main>
  );
}
