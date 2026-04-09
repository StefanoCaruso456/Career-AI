"use client";

import { LoaderCircle } from "lucide-react";
import { getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import styles from "./google-sign-in-button.module.css";

type GoogleProviderStatus = "checking" | "ready" | "unavailable";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path
        d="M17.64 9.2045c0-.6382-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436a4.1422 4.1422 0 0 1-1.7972 2.7182v2.2582h2.9091c1.7018-1.5664 2.6845-3.8728 2.6845-6.6173Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1782l-2.9091-2.2582c-.8059.54-1.8368.8591-3.0473.8591-2.3432 0-4.3277-1.5823-5.0359-3.7091H.9568v2.3318A8.9986 8.9986 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.9641 10.7136A5.4106 5.4106 0 0 1 3.6818 9c0-.5959.1018-1.1759.2823-1.7136V4.9545H.9568A8.9982 8.9982 0 0 0 0 9c0 1.45.3477 2.8227.9568 4.0455l3.0073-2.3319Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.5773c1.3214 0 2.5077.4541 3.4418 1.3459l2.5818-2.5818C13.4632.8918 11.43 0 9 0A8.9986 8.9986 0 0 0 .9568 4.9545l3.0073 2.3319C4.6723 5.1595 6.6568 3.5773 9 3.5773Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  callbackUrl,
  disabled = false,
  label = "Continue with Google",
}: {
  callbackUrl: string;
  disabled?: boolean;
  label?: string;
}) {
  const [isPending, setIsPending] = useState(false);
  const [providerStatus, setProviderStatus] = useState<GoogleProviderStatus>("checking");

  useEffect(() => {
    let isActive = true;

    void getProviders()
      .then((providers) => {
        if (!isActive) {
          return;
        }

        setProviderStatus(providers?.google ? "ready" : "unavailable");
      })
      .catch(() => {
        if (isActive) {
          setProviderStatus("unavailable");
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const isConfigured = providerStatus === "ready";
  const isDisabled = disabled || isPending || !isConfigured;
  const buttonLabel = isPending
    ? "Opening Google..."
    : providerStatus === "checking"
      ? "Checking Google sign-in..."
      : providerStatus === "unavailable"
        ? "Google sign-in unavailable"
        : label;

  return (
    <button
      className={styles.button}
      disabled={isDisabled}
      onClick={() => {
        if (isDisabled || !isConfigured) {
          return;
        }

        setIsPending(true);
        void signIn("google", { callbackUrl }).catch(() => {
          setIsPending(false);
        });
      }}
      type="button"
    >
      <span className={styles.iconShell} aria-hidden="true">
        {isPending ? <LoaderCircle className={styles.spinner} size={18} strokeWidth={2} /> : <GoogleMark />}
      </span>
      <span className={styles.label}>{buttonLabel}</span>
      <span className={styles.trailingSlot} aria-hidden="true" />
    </button>
  );
}
