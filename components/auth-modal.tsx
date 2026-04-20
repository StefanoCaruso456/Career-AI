"use client";

import { ShieldCheck, Sparkles, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { getGoogleAuthDisabledMessage } from "@/auth-config";
import { createPortal } from "react-dom";
import { GoogleSignInButton } from "./google-sign-in-button";
import { useGoogleAuthStatus } from "./use-google-auth-status";
import {
  getAuthCallbackUrl,
  personaConfigs,
  type Persona,
} from "@/lib/personas";
import styles from "./auth-modal.module.css";

const defaultGoogleOAuthDisabledMessage = getGoogleAuthDisabledMessage();

type AuthMode = "signup" | "signin";
type AuthFormValues = {
  confirmPassword: string;
  email: string;
  name: string;
  password: string;
};

type AuthModalTriggerProps = {
  callbackUrl?: string;
  className?: string;
  defaultMode?: AuthMode;
  googleOAuthEnabled?: boolean;
  label: string;
};

function getModeCopy({
  authMode,
  persona,
}: {
  authMode: AuthMode;
  persona: Persona;
}) {
  if (persona === "employer") {
    if (authMode === "signup") {
      return {
        buttonLabel: "Continue with Google",
        copy:
          "Set up a business workspace to verify candidate credibility, reduce screening friction, and hire with more confidence.",
        emailActionLabel: "Create account",
        formStatus:
          "Email/password sign-up is not enabled yet. Use Google to create your employer workspace securely.",
        title: "Create your employer workspace",
      };
    }

    return {
      buttonLabel: "Sign in with Google",
      copy:
        "Return to your hiring workspace to review candidate signals, align your team, and move faster on the right talent.",
      emailActionLabel: "Sign in",
      formStatus:
        "Email/password sign-in is not enabled yet. Use Google to continue securely.",
      title: "Sign in to Career AI for Employers",
    };
  }

  if (authMode === "signup") {
    return {
      buttonLabel: "Continue with Google",
      copy:
        "Build a verified career identity to increase credibility, attract employers, and get hired faster.",
      emailActionLabel: "Create account",
      formStatus:
        "Email/password sign-up is not enabled yet. Use Google to create your workspace securely.",
      title: "Create your Career AI account",
    };
  }

  return {
    buttonLabel: "Sign in with Google",
    copy:
      "Return to your workspace and pick up your verified profile where you left it.",
    emailActionLabel: "Sign in",
    formStatus:
      "Email/password sign-in is not enabled yet. Use Google to continue securely.",
    title: "Sign in to Career AI",
  };
}

const emptyFormValues: AuthFormValues = {
  confirmPassword: "",
  email: "",
  name: "",
  password: "",
};

export function AuthModalTrigger({
  callbackUrl,
  className,
  defaultMode = "signin",
  googleOAuthEnabled: googleOAuthEnabledOverride,
  label,
}: AuthModalTriggerProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(defaultMode);
  const [persona, setPersona] = useState<Persona>("job_seeker");
  const [formValues, setFormValues] = useState<AuthFormValues>(emptyFormValues);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const passwordsMatch =
    authMode !== "signup" ||
    formValues.confirmPassword.length === 0 ||
    formValues.password === formValues.confirmPassword;
  const titleId = useId();
  const { isLoading: isGoogleAuthLoading, status: googleAuthStatus } = useGoogleAuthStatus(
    isOpen && googleOAuthEnabledOverride === undefined,
  );
  const modeCopy = getModeCopy({ authMode, persona });
  const authCallbackUrl = getAuthCallbackUrl({
    callbackUrl,
    persona,
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    const originalOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => {
      modalRef.current?.focus();
    });

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  function openModal() {
    setAuthMode(defaultMode);
    setPersona("job_seeker");
    setFormValues(emptyFormValues);
    setFormStatus(null);
    setIsOpen(true);
  }

  function closeModal() {
    setIsOpen(false);
  }

  function handleAuthModeChange(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setFormStatus(null);
  }

  function handlePersonaChange(nextPersona: Persona) {
    setPersona(nextPersona);
    setFormStatus(null);
  }

  function handleFieldChange(field: keyof AuthFormValues) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setFormValues((currentValues) => ({
        ...currentValues,
        [field]: event.target.value,
      }));

      if (formStatus) {
        setFormStatus(null);
      }
    };
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (authMode === "signup" && formValues.password !== formValues.confirmPassword) {
      setFormStatus("Passwords must match before you create your account.");
      return;
    }

    setFormStatus(modeCopy.formStatus);
  }

  const googleOAuthEnabled = googleOAuthEnabledOverride ?? googleAuthStatus.enabled;
  const googleSignInDisabled =
    googleOAuthEnabledOverride === undefined
      ? isGoogleAuthLoading || !googleOAuthEnabled
      : !googleOAuthEnabled;
  const googleSignInDisabledLabel =
    googleOAuthEnabledOverride === undefined && isGoogleAuthLoading
      ? "Checking Google sign-in..."
      : "Google sign-in unavailable";
  const googleOAuthDisabledMessage =
    googleOAuthEnabledOverride === undefined
      ? isGoogleAuthLoading
        ? "Checking Google sign-in configuration."
        : googleAuthStatus.disabledMessage
      : defaultGoogleOAuthDisabledMessage;

  const modal =
    isMounted && isOpen
      ? createPortal(
          <div className={styles.overlay} onClick={closeModal} role="presentation">
            <div
              aria-labelledby={titleId}
              aria-modal="true"
              className={styles.modal}
              onClick={(event) => {
                event.stopPropagation();
              }}
              ref={modalRef}
              role="dialog"
              tabIndex={-1}
            >
              <div className={styles.header}>
                <div className={styles.headerCopy}>
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

              <div className={styles.selectorGrid}>
                <div className={styles.selectorGroup}>
                  <span className={styles.selectorLabel}>Access</span>
                  <div className={styles.modeSwitch}>
                    <button
                      className={authMode === "signup" ? styles.modeButtonActive : styles.modeButton}
                      onClick={() => handleAuthModeChange("signup")}
                      type="button"
                    >
                      Sign up
                    </button>
                    <button
                      className={authMode === "signin" ? styles.modeButtonActive : styles.modeButton}
                      onClick={() => handleAuthModeChange("signin")}
                      type="button"
                    >
                      Sign in
                    </button>
                  </div>
                </div>

                <div className={styles.selectorGroup}>
                  <span className={styles.selectorLabel}>Experience</span>
                  <div className={styles.modeSwitch}>
                    <button
                      className={persona === "job_seeker" ? styles.modeButtonActive : styles.modeButton}
                      onClick={() => handlePersonaChange("job_seeker")}
                      type="button"
                    >
                      {personaConfigs.job_seeker.shortLabel}
                    </button>
                    <button
                      className={persona === "employer" ? styles.modeButtonActive : styles.modeButton}
                      onClick={() => handlePersonaChange("employer")}
                      type="button"
                    >
                      {personaConfigs.employer.shortLabel}
                    </button>
                  </div>
                </div>
              </div>

              <p className={styles.copy}>{modeCopy.copy}</p>

              <form className={styles.formCard} onSubmit={handleFormSubmit}>
                <div className={styles.fieldGrid}>
                  {authMode === "signup" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Full name</span>
                      <input
                        autoComplete="name"
                        className={styles.input}
                        name="name"
                        onChange={handleFieldChange("name")}
                        placeholder="Taylor Morgan"
                        required
                        type="text"
                        value={formValues.name}
                      />
                    </label>
                  ) : null}

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Email</span>
                    <input
                      autoComplete="email"
                      className={styles.input}
                      name="email"
                      onChange={handleFieldChange("email")}
                      placeholder="you@company.com"
                      required
                      type="email"
                      value={formValues.email}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Password</span>
                    <input
                      autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                      className={styles.input}
                      name="password"
                      onChange={handleFieldChange("password")}
                      placeholder={authMode === "signup" ? "Create a secure password" : "Enter your password"}
                      required
                      type="password"
                      value={formValues.password}
                    />
                  </label>

                  {authMode === "signup" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Confirm password</span>
                      <input
                        autoComplete="new-password"
                        aria-invalid={!passwordsMatch}
                        className={!passwordsMatch ? `${styles.input} ${styles.inputError}` : styles.input}
                        name="confirmPassword"
                        onChange={handleFieldChange("confirmPassword")}
                        placeholder="Re-enter your password"
                        required
                        type="password"
                        value={formValues.confirmPassword}
                      />
                    </label>
                  ) : null}
                </div>

                <button className={styles.emailAction} type="submit">
                  {modeCopy.emailActionLabel}
                </button>

                {formStatus ? (
                  <p aria-live="polite" className={styles.formStatus}>
                    {formStatus}
                  </p>
                ) : null}
              </form>

              <div className={styles.divider}>
                <span>Or continue instantly</span>
              </div>

              <div className={styles.actionBlock}>
                <GoogleSignInButton
                  callbackUrl={authCallbackUrl}
                  disabled={googleSignInDisabled}
                  disabledLabel={googleSignInDisabledLabel}
                  disabledTitle={googleSignInDisabled ? googleOAuthDisabledMessage : undefined}
                  label={modeCopy.buttonLabel}
                  persona={persona}
                />
                {googleSignInDisabled ? (
                  <p className={styles.googleStatusNote} role="status">
                    {googleOAuthDisabledMessage}
                  </p>
                ) : null}
                <div className={styles.trustRow}>
                  <div className={styles.trustPill}>
                    <ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
                    Verified Google email only
                  </div>
                  <div className={styles.trustPill}>
                    <Sparkles aria-hidden="true" size={16} strokeWidth={2} />
                    Protected workspace entry
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button className={[styles.trigger, className].filter(Boolean).join(" ")} onClick={openModal} type="button">
        {label}
      </button>
      {modal}
    </>
  );
}
