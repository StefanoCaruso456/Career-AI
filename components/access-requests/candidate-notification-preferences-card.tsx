"use client";

import { useState, useTransition } from "react";
import type { CandidateNotificationPreferences } from "@/packages/contracts/src";
import styles from "./access-request-workflow.module.css";

type StatusMessage =
  | {
      tone: "error" | "success";
      value: string;
    }
  | null;

export function CandidateNotificationPreferencesCard({
  initialPreferences,
  initialPhoneOptional,
}: {
  initialPhoneOptional: string | null;
  initialPreferences: CandidateNotificationPreferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);
  const [isPending, startTransition] = useTransition();

  const phoneAvailable = Boolean(initialPhoneOptional?.trim());

  function handleToggle(nextValue: boolean) {
    setStatusMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/me/notification-preferences", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            accessRequestSmsEnabled: nextValue,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | CandidateNotificationPreferences
          | { message?: string }
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "We couldn't update your notification preference.",
          );
        }

        setPreferences(payload as CandidateNotificationPreferences);
        setStatusMessage({
          tone: "success",
          value: nextValue ? "SMS alerts enabled." : "SMS alerts turned off.",
        });
      } catch (error) {
        setStatusMessage({
          tone: "error",
          value:
            error instanceof Error
              ? error.message
              : "We couldn't update your notification preference.",
        });
      }
    });
  }

  return (
    <section className={styles.card}>
      <div className={styles.stack}>
        <div>
          <span className={styles.eyebrow}>Alerts</span>
          <h2>Access-request notifications</h2>
        </div>

        <p className={styles.lead}>
          Career ID access requests always appear in your in-app inbox and are sent by email.
          SMS is optional and only used when you enable phone alerts.
        </p>

        <div className={styles.metaGrid}>
          <article className={styles.metaCard}>
            <span className={styles.metaLabel}>In-app inbox</span>
            <strong className={styles.metaValue}>Always on</strong>
          </article>
          <article className={styles.metaCard}>
            <span className={styles.metaLabel}>Email</span>
            <strong className={styles.metaValue}>
              {preferences.accessRequestEmailEnabled ? "Enabled" : "Disabled"}
            </strong>
          </article>
          <article className={styles.metaCard}>
            <span className={styles.metaLabel}>Phone number</span>
            <strong className={styles.metaValue}>
              {phoneAvailable ? "Available" : "Not added"}
            </strong>
          </article>
        </div>

        <div className={styles.toggleRow}>
          <div>
            <h3>Optional SMS alerts</h3>
            <p className={styles.smallNote}>
              {phoneAvailable
                ? "Send a secure review link by text message when a recruiter requests access."
                : "Add a phone number in your profile before you can enable SMS alerts."}
            </p>
          </div>
          <button
            className={styles.primaryButton}
            disabled={isPending || !phoneAvailable}
            onClick={() => {
              handleToggle(!preferences.accessRequestSmsEnabled);
            }}
            type="button"
          >
            {preferences.accessRequestSmsEnabled ? "Disable SMS" : "Enable SMS"}
          </button>
        </div>

        {statusMessage ? (
          <p
            className={[
              styles.statusMessage,
              statusMessage.tone === "success"
                ? styles.statusMessageSuccess
                : styles.statusMessageError,
            ].join(" ")}
          >
            {statusMessage.value}
          </p>
        ) : null}
      </div>
    </section>
  );
}
