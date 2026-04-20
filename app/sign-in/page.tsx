import { redirect } from "next/navigation";
import { auth, googleOAuthDisabledMessage, googleOAuthEnabled } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { getPostSignInDestination } from "@/lib/authenticated-workspace";
import {
  getAuthCallbackUrl,
  personaConfigs,
  resolvePersona,
} from "@/lib/personas";
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
  const personaConfig = personaConfigs[persona];
  const title =
    persona === "employer"
      ? "Sign in to your Career AI employer workspace"
      : "Sign in to your Career AI workspace";
  const copy =
    persona === "employer"
      ? "Use Google to verify your email, restore your employer session, and step back into your hiring workspace."
      : "Use Google to verify your email, restore your session, and step straight into your protected Career AI workspace.";

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

    redirect(
      getPostSignInDestination({
        callbackUrl,
        onboardingStatus: context.onboarding.status,
      }),
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.eyebrow}>{personaConfig.signInEyebrow}</div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.copy}>{copy}</p>

        <GoogleSignInButton
          callbackUrl={callbackUrl}
          disabled={!googleOAuthEnabled}
          disabledLabel="Google sign-in unavailable"
          disabledTitle={
            googleOAuthEnabled ? undefined : googleOAuthDisabledMessage
          }
          label="Sign in with Google"
          persona={persona}
        />

        <div className={styles.noteCard}>
          <strong>
            {googleOAuthEnabled
              ? "Google sign-in runs through our server-side OAuth flow."
              : "Google sign-in is disabled locally."}
          </strong>
          <p>
            {googleOAuthEnabled
              ? `After authentication, you will land in ${callbackUrl}.`
              : `${googleOAuthDisabledMessage} The Google client secret stays on the server.`}
          </p>
        </div>
      </section>
    </main>
  );
}
