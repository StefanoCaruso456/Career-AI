"use client";

import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import styles from "./credentials-sign-in-panel.module.css";

export function CredentialsSignInPanel({
  callbackUrl,
  onSuccessRedirect,
}: {
  callbackUrl: string;
  onSuccessRedirect?: (url: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setFormStatus("Please enter your email and password.");
      return;
    }

    setFormStatus(null);
    setIsSubmitting(true);

    try {
      const signInResult = await signIn("credentials", {
        callbackUrl,
        email: normalizedEmail,
        password,
        redirect: false,
      });

      if (!signInResult || signInResult.error) {
        setFormStatus(
          "Invalid email or password. If this account was created with Google, use Google sign-in instead.",
        );
        return;
      }

      const destination = signInResult.url ?? callbackUrl;

      if (onSuccessRedirect) {
        onSuccessRedirect(destination);
        return;
      }

      window.location.assign(destination);
    } catch {
      setFormStatus("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.fieldGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Email</span>
          <input
            autoComplete="email"
            className={styles.input}
            name="email"
            onChange={(event) => {
              setEmail(event.target.value);

              if (formStatus) {
                setFormStatus(null);
              }
            }}
            placeholder="you@company.com"
            required
            type="email"
            value={email}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Password</span>
          <div className={styles.passwordField}>
            <input
              aria-label="Password"
              autoComplete="current-password"
              className={`${styles.input} ${styles.passwordInput}`}
              name="password"
              onChange={(event) => {
                setPassword(event.target.value);

                if (formStatus) {
                  setFormStatus(null);
                }
              }}
              placeholder="Enter your password"
              required
              type={showPassword ? "text" : "password"}
              value={password}
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
      </div>

      <button className={styles.submitButton} disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing in..." : "Sign in with email"}
      </button>

      {formStatus ? (
        <p aria-live="polite" className={styles.formStatus}>
          {formStatus}
        </p>
      ) : null}
    </form>
  );
}
