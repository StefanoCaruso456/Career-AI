"use client";

import { GoogleSignInButton } from "./google-sign-in-button";
import { useGoogleAuthStatus } from "./use-google-auth-status";
import type { Persona } from "@/lib/personas";

export function GoogleSignInPanel({
  callbackUrl,
  persona,
}: {
  callbackUrl: string;
  persona: Persona;
}) {
  const { isLoading, status } = useGoogleAuthStatus();
  const isGoogleSignInUnavailable = isLoading || !status.enabled;
  const disabledLabel = isLoading ? "Checking Google sign-in..." : "Google sign-in unavailable";

  return (
    <GoogleSignInButton
      callbackUrl={callbackUrl}
      disabled={isGoogleSignInUnavailable}
      disabledLabel={disabledLabel}
      disabledTitle={isGoogleSignInUnavailable ? status.disabledMessage : undefined}
      label="Sign in with Google"
      persona={persona}
    />
  );
}
