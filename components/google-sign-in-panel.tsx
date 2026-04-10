"use client";

import styles from "@/app/sign-in/page.module.css";
import { GoogleSignInButton } from "./google-sign-in-button";
import { useGoogleAuthStatus } from "./use-google-auth-status";
import type { Persona } from "@/lib/personas";

export function GoogleSignInPanel({
  callbackUrl,
  note,
  persona,
}: {
  callbackUrl: string;
  note: string;
  persona: Persona;
}) {
  const { isLoading, status } = useGoogleAuthStatus();
  const isGoogleSignInUnavailable = isLoading || !status.enabled;
  const disabledLabel = isLoading ? "Checking Google sign-in..." : "Google sign-in unavailable";
  const disabledMessage = isLoading
    ? "Checking Google sign-in configuration."
    : status.disabledMessage;

  return (
    <>
      <GoogleSignInButton
        callbackUrl={callbackUrl}
        disabled={isGoogleSignInUnavailable}
        disabledLabel={disabledLabel}
        disabledTitle={isGoogleSignInUnavailable ? disabledMessage : undefined}
        label="Sign in with Google"
        persona={persona}
      />

      <div className={styles.noteCard}>
        <strong>
          {isLoading
            ? "Checking Google sign-in..."
            : status.enabled
              ? "Google sign-in runs through our server-side OAuth and identity provisioning flow."
              : "Google sign-in is unavailable on this deployment."}
        </strong>
        <p>
          {isLoading
            ? "The button will enable automatically as soon as the server reports a ready OAuth configuration."
            : status.enabled
              ? note
              : `${disabledMessage} The Google client secret stays on the server.`}
        </p>
      </div>
    </>
  );
}
