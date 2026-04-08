"use client";

import { ShieldCheck, Sparkles, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useState } from "react";
import { GoogleSignInButton } from "./google-sign-in-button";
import styles from "./auth-modal.module.css";

type AuthMode = "signup" | "signin";

type AuthModalTriggerProps = {
  callbackUrl?: string;
  className?: string;
  defaultMode?: AuthMode;
  googleOAuthEnabled: boolean;
  label: string;
  productionOrigin: string;
  productionRedirectUri: string;
};

function getModeCopy(mode: AuthMode) {
  if (mode === "signup") {
    return {
      eyebrow: "Create your account",
      title: "Start your Talent Agent ID with Google",
      copy:
        "Create your verified account, unlock your protected workspace, and start turning proof into a portable identity layer.",
      buttonLabel: "Sign up with Google",
    };
  }

  return {
    eyebrow: "Welcome back",
    title: "Sign in to your Talent Agent ID workspace",
    copy:
      "Reconnect your Google account, restore your session, and jump back into the verified account experience without leaving the landing page.",
    buttonLabel: "Sign in with Google",
  };
}

export function AuthModalTrigger({
  callbackUrl = "/account",
  className,
  defaultMode = "signin",
  googleOAuthEnabled,
  label,
  productionOrigin,
  productionRedirectUri,
}: AuthModalTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  function openModal() {
    setMode(defaultMode);
    setIsOpen(true);
  }

  function closeModal() {
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      closeModal();
    }
  }

  const modeCopy = getModeCopy(mode);

  return (
    <>
      <button className={[styles.trigger, className].filter(Boolean).join(" ")} onClick={openModal} type="button">
        {label}
      </button>

      {isOpen ? (
        <div className={styles.overlay} onClick={closeModal} role="presentation">
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className={styles.modal}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={handleKeyDown}
            role="dialog"
            tabIndex={-1}
          >
            <div className={styles.header}>
              <div className={styles.headerCopy}>
                <span className={styles.eyebrow}>{modeCopy.eyebrow}</span>
                <h2 className={styles.title} id={titleId}>
                  {modeCopy.title}
                </h2>
              </div>

              <button
                aria-label="Close authentication modal"
                className={styles.closeButton}
                onClick={closeModal}
                type="button"
              >
                <X size={18} strokeWidth={2.2} />
              </button>
            </div>

            <div className={styles.modeSwitch}>
              <button
                className={mode === "signup" ? styles.modeButtonActive : styles.modeButton}
                onClick={() => setMode("signup")}
                type="button"
              >
                Sign up
              </button>
              <button
                className={mode === "signin" ? styles.modeButtonActive : styles.modeButton}
                onClick={() => setMode("signin")}
                type="button"
              >
                Sign in
              </button>
            </div>

            <p className={styles.copy}>{modeCopy.copy}</p>

            {googleOAuthEnabled ? (
              <div className={styles.actionBlock}>
                <GoogleSignInButton callbackUrl={callbackUrl} label={modeCopy.buttonLabel} />
                <div className={styles.trustRow}>
                  <div className={styles.trustPill}>
                    <ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
                    Verified Google email only
                  </div>
                  <div className={styles.trustPill}>
                    <Sparkles aria-hidden="true" size={16} strokeWidth={2} />
                    Lands directly in `/account`
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.warning}>
                <strong>Backend setup still needs its auth variables.</strong>
                <p>
                  The app accepts either <code>GOOGLE_CLIENT_ID</code> /
                  <code> GOOGLE_CLIENT_SECRET</code> or the Railway names you already made:
                  <code> CLIENT_ID</code> / <code>CLIENT_SECRET</code>.
                </p>
                <p>
                  You also need <code>NEXTAUTH_SECRET</code>. If Railway exposes a public
                  domain, the app can derive <code>NEXTAUTH_URL</code> automatically.
                </p>
              </div>
            )}

            <div className={styles.configBlock}>
              <div className={styles.valueRow}>
                <span>Authorized JavaScript origin</span>
                <code>{productionOrigin}</code>
              </div>
              <div className={styles.valueRow}>
                <span>Authorized redirect URI</span>
                <code>{productionRedirectUri}</code>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
