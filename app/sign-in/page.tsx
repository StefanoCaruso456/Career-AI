import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { CredentialsSignInPanel } from "@/components/credentials-sign-in-panel";
import { GoogleSignInPanel } from "@/components/google-sign-in-panel";
import {
  getAuthCallbackUrl,
  personaConfigs,
  resolvePersona,
} from "@/lib/personas";
import { resolveAuthenticatedDestination } from "@/packages/onboarding/src";
import styles from "./page.module.css";

function readQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{
    callbackUrl?: string | string[];
    persona?: string | string[];
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedCallbackUrl = readQueryValue(resolvedSearchParams?.callbackUrl);
  const requestedPersona = readQueryValue(resolvedSearchParams?.persona);
  const persona = resolvePersona({
    callbackUrl: requestedCallbackUrl,
    persona: requestedPersona,
  });
  const callbackUrl = getAuthCallbackUrl({
    callbackUrl: requestedCallbackUrl,
    persona,
  });
  const session = await auth();

  if (session?.user) {
    if (persona === "employer") {
      redirect(callbackUrl);
    }

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

  const personaConfig = personaConfigs[persona];
  const title =
    persona === "employer"
      ? "Sign in to your Career AI employer workspace"
      : "Sign in to your Career AI workspace";
  const copy =
    persona === "employer"
      ? "Use the password you created for this workspace, or continue with Google if this employer account was created with Google."
      : "Use the password you created for this account, or continue with Google if you originally created this account with Google.";

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.eyebrow}>{personaConfig.signInEyebrow}</div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.copy}>{copy}</p>
        <div className={styles.authStack}>
          <CredentialsSignInPanel callbackUrl={callbackUrl} />
          <div className={styles.divider} aria-hidden="true">
            <span>or</span>
          </div>
          <GoogleSignInPanel callbackUrl={callbackUrl} persona={persona} />
        </div>
      </section>
    </main>
  );
}
