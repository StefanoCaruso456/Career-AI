"use client";

import { Eye, EyeOff, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { createPortal } from "react-dom";
import { GoogleSignInButton } from "./google-sign-in-button";
import { useGoogleAuthStatus } from "./use-google-auth-status";
import {
  getAuthCallbackUrl,
  personaConfigs,
  type Persona,
} from "@/lib/personas";
import styles from "./auth-modal.module.css";

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
        "Return to your hiring workspace with the password you created for this account, or keep using Google if your workspace was created with Google.",
      emailActionLabel: "Sign in",
      formStatus: "Use your password or continue with Google to sign in securely.",
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
      "Return with the password you created for this account, or keep using Google if your account was created with Google.",
    emailActionLabel: "Sign in",
    formStatus: "Use your password or continue with Google to sign in securely.",
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
  label,
}: AuthModalTriggerProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(defaultMode);
  const [persona, setPersona] = useState<Persona>("job_seeker");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formValues, setFormValues] = useState<AuthFormValues>(emptyFormValues);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const passwordsMatch =
    authMode !== "signup" ||
    formValues.confirmPassword.length === 0 ||
    formValues.password === formValues.confirmPassword;
  const titleId = useId();
  const modeCopy = getModeCopy({ authMode, persona });
  const authCallbackUrl = getAuthCallbackUrl({
    callbackUrl,
    persona,
  });
  const { isLoading: isGoogleAuthLoading, status: googleAuthStatus } = useGoogleAuthStatus(isOpen);
  const googleOAuthEnabled = googleAuthStatus.enabled;
  const googleSignInDisabled = isGoogleAuthLoading || !googleOAuthEnabled;
  const googleSignInDisabledLabel = isGoogleAuthLoading
    ? "Checking Google sign-in..."
    : "Google sign-in unavailable";
  const googleOAuthDisabledMessage = isGoogleAuthLoading
    ? "Checking Google sign-in configuration."
    : googleAuthStatus.disabledMessage;

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
    setIsSubmitting(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormValues(emptyFormValues);
    setFormStatus(null);
    setIsOpen(true);
  }

  function closeModal() {
    if (isSubmitting) {
      return;
    }

    setIsOpen(false);
  }

  function handleAuthModeChange(nextMode: AuthMode) {
    if (isSubmitting) {
      return;
    }

    setAuthMode(nextMode);
    setFormStatus(null);
  }

  function handlePersonaChange(nextPersona: Persona) {
    if (isSubmitting) {
      return;
    }

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

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (authMode === "signup" && formValues.password !== formValues.confirmPassword) {
      setFormStatus("Passwords must match before you create your account.");
      return;
    }

    if (persona === "employer" && authMode === "signup") {
      setFormStatus(
        "Email/password sign-up is not enabled yet for employer workspaces. Use Google to continue.",
      );
      return;
    }

    const email = formValues.email.trim().toLowerCase();
    const password = formValues.password;

    if (!email || !password) {
      setFormStatus("Please enter your email and password.");
      return;
    }

    setFormStatus(null);
    setIsSubmitting(true);

    try {
      if (authMode === "signup") {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: formValues.name.trim(),
            email,
            password,
          }),
        });

        const registerPayload = (await registerResponse.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!registerResponse.ok) {
          setFormStatus(
            registerPayload?.error ??
              "We could not create your account right now. Please try again.",
          );
          return;
        }
      }

      const signInResult = await signIn("credentials", {
        callbackUrl: authCallbackUrl,
        email,
        password,
        redirect: false,
      });

      if (!signInResult || signInResult.error) {
        setFormStatus(
          authMode === "signup"
            ? "Account created, but we could not sign you in. Please try signing in."
            : "Invalid email or password. If this account was created with Google, use Google sign-in instead.",
        );
        return;
      }

      window.location.assign(signInResult.url ?? authCallbackUrl);
    } catch {
      setFormStatus("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
                      disabled={isSubmitting}
                      className={authMode === "signup" ? styles.modeButtonActive : styles.modeButton}
                      onClick={() => handleAuthModeChange("signup")}
                      type="button"
                    >
                      Sign up
                    </button>
                    <button
                      disabled={isSubmitting}
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
                      disabled={isSubmitting}
                      className={persona === "job_seeker" ? styles.modeButtonActive : styles.modeButton}
                      onClick={() => handlePersonaChange("job_seeker")}
                      type="button"
                    >
                      {personaConfigs.job_seeker.shortLabel}
                    </button>
                    <button
                      disabled={isSubmitting}
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
                    <div className={styles.passwordField}>
                      <input
                        aria-label="Password"
                        autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                        className={`${styles.input} ${styles.passwordInput}`}
                        name="password"
                        onChange={handleFieldChange("password")}
                        placeholder={authMode === "signup" ? "Create a secure password" : "Enter your password"}
                        required
                        type={showPassword ? "text" : "password"}
                        value={formValues.password}
                      />
                      <button
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className={styles.passwordToggle}
                        onClick={() => {
                          setShowPassword((currentValue) => !currentValue);
                        }}
                        type="button"
                      >
                        {showPassword ? (
                          <EyeOff aria-hidden="true" size={16} strokeWidth={2} />
                        ) : (
                          <Eye aria-hidden="true" size={16} strokeWidth={2} />
                        )}
                      </button>
                    </div>
                  </label>

                  {authMode === "signup" ? (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Confirm password</span>
                      <div className={styles.passwordField}>
                        <input
                          autoComplete="new-password"
                          aria-invalid={!passwordsMatch}
                          aria-label="Confirm password"
                          className={
                            !passwordsMatch
                              ? `${styles.input} ${styles.passwordInput} ${styles.inputError}`
                              : `${styles.input} ${styles.passwordInput}`
                          }
                          name="confirmPassword"
                          onChange={handleFieldChange("confirmPassword")}
                          placeholder="Re-enter your password"
                          required
                          type={showConfirmPassword ? "text" : "password"}
                          value={formValues.confirmPassword}
                        />
                        <button
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          className={styles.passwordToggle}
                          onClick={() => {
                            setShowConfirmPassword((currentValue) => !currentValue);
                          }}
                          type="button"
                        >
                          {showConfirmPassword ? (
                            <EyeOff aria-hidden="true" size={16} strokeWidth={2} />
                          ) : (
                            <Eye aria-hidden="true" size={16} strokeWidth={2} />
                          )}
                        </button>
                      </div>
                    </label>
                  ) : null}
                </div>

                <button className={styles.emailAction} disabled={isSubmitting || !passwordsMatch} type="submit">
                  {isSubmitting
                    ? authMode === "signup"
                      ? "Creating account..."
                      : "Signing in..."
                    : modeCopy.emailActionLabel}
                </button>

                {formStatus ? (
                  <p aria-live="polite" className={styles.formStatus}>
                    {formStatus}
                  </p>
                ) : null}
              </form>

              <div className={styles.actionBlock}>
                <GoogleSignInButton
                  callbackUrl={authCallbackUrl}
                  disabled={googleSignInDisabled}
                  disabledLabel={googleSignInDisabledLabel}
                  disabledTitle={googleSignInDisabled ? googleOAuthDisabledMessage : undefined}
                  label={modeCopy.buttonLabel}
                  persona={persona}
                />
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
