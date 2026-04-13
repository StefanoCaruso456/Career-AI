"use client";

import { useEffect, useState, useTransition } from "react";
import type {
  AccessRequestListResponseDto,
  RecruiterPrivateCandidateProfileDto,
} from "@/packages/contracts/src";
import styles from "./access-request-workflow.module.css";

const DURATION_OPTIONS = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "No expiration requested", value: "none" },
];

type StatusMessage =
  | {
      tone: "error" | "success";
      value: string;
    }
  | null;

function getStatusPillClass(status: string) {
  if (status === "granted" || status === "active") {
    return styles.pillGranted;
  }

  if (status === "rejected" || status === "revoked") {
    return styles.pillRejected;
  }

  if (status === "expired") {
    return styles.pillExpired;
  }

  return styles.pillPending;
}

function getDisplayStatusLabel(args: {
  grantLifecycleStatusOptional: string | null;
  requestStatus: string;
}) {
  if (args.requestStatus === "granted" && args.grantLifecycleStatusOptional) {
    return args.grantLifecycleStatusOptional;
  }

  return args.requestStatus;
}

export function RecruiterAccessRequestPanel({
  candidateId,
  candidateName,
}: {
  candidateId: string;
  candidateName: string;
}) {
  const [justification, setJustification] = useState("");
  const [durationValue, setDurationValue] = useState("30");
  const [requests, setRequests] = useState<AccessRequestListResponseDto["items"]>([]);
  const [privateProfile, setPrivateProfile] = useState<RecruiterPrivateCandidateProfileDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);

  async function loadState() {
    setIsLoading(true);

    try {
      const [requestsResponse, privateResponse] = await Promise.all([
        fetch(
          `/api/v1/access-requests?view=requester&subjectTalentIdentityId=${encodeURIComponent(candidateId)}`,
          {
            cache: "no-store",
          },
        ),
        fetch(`/api/v1/employer/candidates/${encodeURIComponent(candidateId)}/private-access`, {
          cache: "no-store",
        }),
      ]);

      const requestsPayload = (await requestsResponse.json().catch(() => null)) as
        | AccessRequestListResponseDto
        | { data?: AccessRequestListResponseDto }
        | null;

      if (requestsResponse.ok) {
        const nextItems =
          requestsPayload && "items" in requestsPayload
            ? requestsPayload.items
            : requestsPayload && "data" in requestsPayload && requestsPayload.data
              ? requestsPayload.data.items
              : [];
        setRequests(nextItems);
      } else {
        setRequests([]);
      }

      if (privateResponse.ok) {
        const privatePayload = (await privateResponse.json().catch(() => null)) as
          | RecruiterPrivateCandidateProfileDto
          | { data?: RecruiterPrivateCandidateProfileDto }
          | null;
        const nextPrivateProfile =
          privatePayload && "access" in privatePayload
            ? privatePayload
            : privatePayload && "data" in privatePayload
              ? privatePayload.data ?? null
              : null;

        setPrivateProfile(nextPrivateProfile);
      } else {
        setPrivateProfile(null);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadState();
  }, [candidateId]);

  const latestRequest = requests[0] ?? null;
  const hasPendingRequest = latestRequest?.status === "pending";
  const hasActiveAccess = Boolean(privateProfile?.access.granted);
  const latestLifecycleStatus = latestRequest
    ? getDisplayStatusLabel({
        grantLifecycleStatusOptional: latestRequest.grantLifecycleStatusOptional,
        requestStatus: latestRequest.status,
      })
    : null;

  function handleSubmit() {
    if (!justification.trim()) {
      setStatusMessage({
        tone: "error",
        value: "Explain why you need access before sending the request.",
      });
      return;
    }

    setStatusMessage(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/v1/access-requests", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            justification: justification.trim(),
            requestedDurationDaysOptional:
              durationValue === "none" ? null : Number(durationValue),
            scope: "candidate_private_profile",
            subjectTalentIdentityId: candidateId,
          }),
        });
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;

        if (!response.ok) {
          throw new Error(payload?.message ?? "We couldn't send the access request.");
        }

        setJustification("");
        setDurationValue("30");
        setStatusMessage({
          tone: "success",
          value: "Access request sent. The candidate can now review it in-app, by email, and by SMS if enabled.",
        });
        await loadState();
      } catch (error) {
        setStatusMessage({
          tone: "error",
          value:
            error instanceof Error
              ? error.message
              : "We couldn't send the access request.",
        });
      }
    });
  }

  return (
    <section className={styles.card} id="private-access">
      <div className={styles.stack}>
        <div>
          <span className={styles.eyebrow}>Private Career ID access</span>
          <h2>Request secure candidate approval</h2>
        </div>

        <p className={styles.lead}>
          Recruiter-safe profile data stays visible by default. Request additional Career ID access
          only when {candidateName} needs to approve a deeper private review.
        </p>

        <div className={styles.form}>
          <div className={styles.field}>
            <label htmlFor={`access-scope-${candidateId}`}>Requested scope</label>
            <select disabled id={`access-scope-${candidateId}`} value="candidate_private_profile">
              <option value="candidate_private_profile">Candidate private profile</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor={`access-duration-${candidateId}`}>Requested access duration</label>
            <select
              id={`access-duration-${candidateId}`}
              onChange={(event) => {
                setDurationValue(event.target.value);
              }}
              value={durationValue}
            >
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor={`access-justification-${candidateId}`}>Why are you requesting access?</label>
            <textarea
              id={`access-justification-${candidateId}`}
              onChange={(event) => {
                setJustification(event.target.value);
              }}
              placeholder="Example: We need the private verification record and supporting evidence for the final hiring review."
              value={justification}
            />
          </div>

          <div className={styles.actions}>
            <button
              className={styles.primaryButton}
              disabled={isPending || hasPendingRequest || hasActiveAccess}
              onClick={handleSubmit}
              type="button"
            >
              {hasActiveAccess
                ? "Access approved"
                : hasPendingRequest
                  ? "Request pending"
                  : "Request Career ID Access"}
            </button>
            <button
              className={styles.secondaryButton}
              disabled={isLoading}
              onClick={() => {
                void loadState();
              }}
              type="button"
            >
              Refresh status
            </button>
          </div>
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

        <div className={styles.stack}>
          <h3>Request status</h3>
          {requests.length === 0 ? (
            <p className={styles.emptyState}>
              No private access request has been sent for this candidate yet.
            </p>
          ) : (
            <ul className={styles.list}>
              {requests.map((request) => (
                (() => {
                  const displayStatus = getDisplayStatusLabel({
                    grantLifecycleStatusOptional: request.grantLifecycleStatusOptional,
                    requestStatus: request.status,
                  });

                  return (
                    <li className={styles.listItem} key={request.id}>
                      <div className={styles.listHeader}>
                        <strong>{request.requester.organizationName}</strong>
                        <span className={[styles.pill, getStatusPillClass(displayStatus)].join(" ")}>
                          {displayStatus}
                        </span>
                      </div>
                      <p className={styles.muted}>{request.justification}</p>
                      <p className={styles.smallNote}>
                        Scope: {request.scope.replaceAll("_", " ")}. Requested duration:{" "}
                        {request.requestedDurationDaysOptional
                          ? `${request.requestedDurationDaysOptional} days`
                          : "No expiration requested"}
                      </p>
                      {request.status === "granted" &&
                      request.grantLifecycleStatusOptional === "active" ? (
                        <p className={styles.smallNote}>
                          Access is active
                          {request.grantedExpiresAtOptional
                            ? ` until ${request.grantedExpiresAtOptional}.`
                            : " with no expiration."}
                        </p>
                      ) : null}
                      {request.status === "granted" &&
                      request.grantLifecycleStatusOptional === "revoked" ? (
                        <p className={styles.smallNote}>
                          Candidate revoked access
                          {request.grantRevokedAtOptional
                            ? ` at ${request.grantRevokedAtOptional}.`
                            : "."}
                        </p>
                      ) : null}
                      {request.status === "granted" &&
                      request.grantLifecycleStatusOptional === "expired" ? (
                        <p className={styles.smallNote}>
                          Access expired
                          {request.grantedExpiresAtOptional
                            ? ` at ${request.grantedExpiresAtOptional}.`
                            : "."}
                        </p>
                      ) : null}
                    </li>
                  );
                })()
              ))}
            </ul>
          )}
        </div>

        <div className={styles.stack}>
          <h3>Granted private data</h3>
          {!privateProfile ? (
            <p className={styles.emptyState}>
              {latestLifecycleStatus === "revoked"
                ? "Candidate-approved access was revoked, so private Career ID data is no longer available."
                : latestLifecycleStatus === "expired"
                  ? "Candidate-approved access expired, so private Career ID data is no longer available."
                  : "Private Career ID data will appear here only after the candidate approves access."}
            </p>
          ) : (
            <>
              <div className={styles.metaGrid}>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Access scope</span>
                  <strong className={styles.metaValue}>
                    {privateProfile.access.scope.replaceAll("_", " ")}
                  </strong>
                </article>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Access expires</span>
                  <strong className={styles.metaValue}>
                    {privateProfile.access.grantedExpiresAtOptional ?? "No expiration"}
                  </strong>
                </article>
                <article className={styles.metaCard}>
                  <span className={styles.metaLabel}>Private profile</span>
                  <strong className={styles.metaValue}>{privateProfile.candidate.legalName ?? candidateName}</strong>
                </article>
              </div>

              <div className={styles.split}>
                <section className={styles.card}>
                  <h3>Profile narrative</h3>
                  <p className={styles.lead}>
                    {privateProfile.profile.coreNarrative ?? "No private narrative has been saved yet."}
                  </p>
                  <p className={styles.smallNote}>
                    Target role: {privateProfile.profile.targetRole ?? "Not specified"}.
                  </p>
                </section>

                <section className={styles.card}>
                  <h3>Employment records</h3>
                  {privateProfile.employmentRecords.length === 0 ? (
                    <p className={styles.emptyState}>No employment records are available.</p>
                  ) : (
                    <ul className={styles.list}>
                      {privateProfile.employmentRecords.map((record) => (
                        <li className={styles.listItem} key={record.claimId}>
                          <strong>{record.roleTitle}</strong>
                          <p className={styles.muted}>{record.employerName}</p>
                          <p className={styles.smallNote}>
                            {record.startDate} to {record.endDateOptional ?? "Present"}.
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
