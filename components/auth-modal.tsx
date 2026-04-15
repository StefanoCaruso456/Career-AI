"use client";

import { ShieldCheck, Sparkles, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { createPortal } from "react-dom";
import { GoogleSignInButton } from "./google-sign-in-button";
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
  googleOAuthEnabled: boolean;
  label: string;
};

function getModeCopy(mode: AuthMode) {
  if (mode === "signup") {
    return {
      eyebrow: "Create your account",
      title: "Create your Career AI account",
      copy:
        "Build a verified career identity to increase credibility, attract employers, and get hired faster.",
      buttonLabel: "Continue with Google",
      emailActionLabel: "Create account",
    };
  }

  return {
    eyebrow: "Welcome back",
    title: "Sign in to Career AI",
    copy:
      "Return to your workspace and pick up your verified profile where you left it.",
    buttonLabel: "Sign in with Google",
    emailActionLabel: "Sign in",
  };
}

const emptyFormValues: AuthFormValues = {
  confirmPassword: "",
  email: "",
  name: "",
  password: "",
};

export function AuthModalTrigger({
  callbackUrl = "/account",
  className,
  defaultMode = "signin",
  googleOAuthEnabled,
  label,
}: AuthModalTriggerProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState<AuthFormValues>(emptyFormValues);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const passwordsMatch =
    mode !== "signup" ||
    formValues.confirmPassword.length === 0 ||
    formValues.password === formValues.confirmPassword;
  const titleId = useId();

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
    setMode(defaultMode);
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

  function handleModeChange(nextMode: AuthMode) {
    if (isSubmitting) {
      return;
    }

    setMode(nextMode);
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

    if (mode === "signup" && formValues.password !== formValues.confirmPassword) {
      setFormStatus("Passwords must match before you create your account.");
      return;
    }

    const email = formValues.email.trim().toLowerCase();
    const password = formValues.password;

    setFormStatus(null);
    setIsSubmitting(true);

    try {
      if (mode === "signup") {
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
        callbackUrl,
        email,
        password,
        redirect: false,
      });

      if (!signInResult || signInResult.error) {
        setFormStatus(
          mode === "signup"
            ? "Account created, but we could not sign you in. Please try signing in."
            : "Invalid email or password.",
        );
        return;
      }

      window.location.assign(signInResult.url ?? callbackUrl);
    } catch {
      setFormStatus("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const modeCopy = getModeCopy(mode);
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
                  disabled={isSubmitting}
                  className={mode === "signup" ? styles.modeButtonActive : styles.modeButton}
                  onClick={() => handleModeChange("signup")}
                  type="button"
                >
                  Sign up
                </button>
                <button
                  disabled={isSubmitting}
                  className={mode === "signin" ? styles.modeButtonActive : styles.modeButton}
                  onClick={() => handleModeChange("signin")}
                  type="button"
                >
                  Sign in
                </button>
              </div>

              <p className={styles.copy}>{modeCopy.copy}</p>

              <form className={styles.formCard} onSubmit={handleFormSubmit}>
                <div className={styles.fieldGrid}>
                  {mode === "signup" ? (
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
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      className={styles.input}
                      name="password"
                      onChange={handleFieldChange("password")}
                      placeholder={mode === "signup" ? "Create a secure password" : "Enter your password"}
                      required
                      type="password"
                      value={formValues.password}
                    />
                  </label>

                  {mode === "signup" ? (
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

                <button className={styles.emailAction} disabled={isSubmitting || !passwordsMatch} type="submit">
                  {isSubmitting
                    ? mode === "signup"
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

              <div className={styles.divider}>
                <span>Or continue instantly</span>
              </div>

              <div className={styles.actionBlock}>
                <GoogleSignInButton
                  callbackUrl={callbackUrl}
                  disabled={!googleOAuthEnabled}
                  label={modeCopy.buttonLabel}
                />
                <div className={styles.trustRow}>
                  <div className={styles.trustPill}>
                    <ShieldCheck aria-hidden="true" size={16} strokeWidth={2} />
                    Secure email/password sign-in
                  </div>
                  <div className={styles.trustPill}>
                    <Sparkles aria-hidden="true" size={16} strokeWidth={2} />
                    Google sign-in also available
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
