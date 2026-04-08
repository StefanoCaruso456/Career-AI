"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";
import styles from "./google-sign-in-button.module.css";

export function GoogleSignInButton({
  callbackUrl,
  label = "Continue with Google",
}: {
  callbackUrl: string;
  label?: string;
}) {
  const [isPending, setIsPending] = useState(false);

  return (
    <button
      className={styles.button}
      disabled={isPending}
      onClick={() => {
        setIsPending(true);
        void signIn("google", { callbackUrl });
      }}
      type="button"
    >
      <span className={styles.mark} aria-hidden="true">
        G
      </span>
      <span>{isPending ? "Opening Google" : label}</span>
      {isPending ? (
        <LoaderCircle className={styles.spinner} size={18} strokeWidth={2} />
      ) : (
        <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
      )}
    </button>
  );
}
