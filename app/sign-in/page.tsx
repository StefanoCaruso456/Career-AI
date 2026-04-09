import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { GoogleSignInPanel } from "@/components/google-sign-in-panel";
import { resolveAuthenticatedDestination } from "@/packages/onboarding/src";
import styles from "./page.module.css";

export default async function SignInPage() {
  const session = await auth();

  if (session?.user) {
    const { context } = await ensurePersistentCareerIdentityForSessionUser({
      user: {
        appUserId: session.user.appUserId,
        authProvider: session.user.authProvider,
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        providerUserId: session.user.providerUserId,
      },
      correlationId: `sign_in_page_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
    });

    redirect(resolveAuthenticatedDestination(context));
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.eyebrow}>Verified access</div>
        <h1 className={styles.title}>Sign in to your Career AI workspace</h1>
        <p className={styles.copy}>
          Use Google to verify your email, restore your session, and continue into
          your persistent Career AI onboarding or account workspace.
        </p>
        <GoogleSignInPanel />
      </section>
    </main>
  );
}
