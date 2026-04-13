"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AccessRequestReviewDto } from "@/packages/contracts/src";
import styles from "./access-request-workflow.module.css";

type StatusMessage =
  | {
      tone: "error" | "success";
      value: string;
    }
  | null;

export function AccessRequestReviewActions({
  canRevoke,
  request,
  reviewTokenOptional,
}: {
  canRevoke: boolean;
  request: AccessRequestReviewDto;
  reviewTokenOptional: string | null;
}) {
  const router = useRouter();
  const [noteOptional, setNoteOptional] = useState("");
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);
  const [isPending, startTransition] = useTransition();

  function handleAction(action: "grant" | "reject" | "revoke") {
    setStatusMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          action === "revoke"
            ? `/api/v1/access-requests/${request.id}/revoke`
            : `/api/v1/access-requests/${request.id}/review/${action}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              action === "revoke"
                ? {
                    noteOptional: noteOptional.trim() || null,
                  }
                : {
                    noteOptional: noteOptional.trim() || null,
                    token: reviewTokenOptional,
                  },
            ),
          },
        );
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? `We couldn't ${action} this request.`);
        }

        setStatusMessage({
          tone: "success",
          value:
            action === "grant"
              ? "Access approved. The recruiter can now view the granted private Career ID data."
              : action === "reject"
                ? "Request rejected. The recruiter will keep the recruiter-safe profile only."
                : "Access revoked. The recruiter immediately loses private Career ID access.",
        });
        router.refresh();
      } catch (error) {
        setStatusMessage({
          tone: "error",
          value:
            error instanceof Error
              ? error.message
              : `We couldn't ${action} this request.`,
        });
      }
    });
  }

  if (request.status !== "pending") {
    if (!(canRevoke && request.status === "granted" && request.grantLifecycleStatusOptional === "active")) {
      return null;
    }

    return (
      <section className={styles.card}>
        <div className={styles.stack}>
          <h2>Manage active grant</h2>
          <p className={styles.lead}>
            Revoke this grant to immediately remove the recruiter&apos;s private Career ID access.
          </p>

          <div className={styles.field}>
            <label htmlFor={`review-note-${request.id}`}>Optional revocation note</label>
            <textarea
              id={`review-note-${request.id}`}
              onChange={(event) => {
                setNoteOptional(event.target.value);
              }}
              placeholder="Add context for why this access is ending."
              value={noteOptional}
            />
          </div>

          <div className={styles.actions}>
            <button
              className={styles.dangerButton}
              disabled={isPending}
              onClick={() => {
                handleAction("revoke");
              }}
              type="button"
            >
              Revoke access
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

  return (
    <section className={styles.card}>
      <div className={styles.stack}>
        <h2>Review decision</h2>
        <p className={styles.lead}>
          Approve to grant the requested scope, or reject to keep this recruiter limited to the
          recruiter-safe profile.
        </p>

        <div className={styles.field}>
          <label htmlFor={`review-note-${request.id}`}>Optional note</label>
          <textarea
            id={`review-note-${request.id}`}
            onChange={(event) => {
              setNoteOptional(event.target.value);
            }}
            placeholder="Add context for the recruiter if helpful."
            value={noteOptional}
          />
        </div>

        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            disabled={isPending}
            onClick={() => {
              handleAction("grant");
            }}
            type="button"
          >
            Approve request
          </button>
          <button
            className={styles.secondaryButton}
            disabled={isPending}
            onClick={() => {
              handleAction("reject");
            }}
            type="button"
          >
            Reject request
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
