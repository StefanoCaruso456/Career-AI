"use client";

import { useEffect, useState } from "react";
import type { GoogleAuthStatus } from "@/auth-config";

const fallbackStatus: GoogleAuthStatus = {
  disabledMessage: "Google sign-in status is temporarily unavailable. Refresh and try again.",
  enabled: false,
  missingRequirements: [],
  redirectUri: "",
};

export function useGoogleAuthStatus(loadWhen = true) {
  const [status, setStatus] = useState<GoogleAuthStatus>(fallbackStatus);
  const [isLoading, setIsLoading] = useState(loadWhen);

  useEffect(() => {
    if (!loadWhen) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    setIsLoading(true);

    void fetch("/api/auth/google-status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load Google sign-in status.");
        }

        const nextStatus = (await response.json()) as GoogleAuthStatus;
        setStatus(nextStatus);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus(fallbackStatus);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [loadWhen]);

  return { isLoading, status };
}
