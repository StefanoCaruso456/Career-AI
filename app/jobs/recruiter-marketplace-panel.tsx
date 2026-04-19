"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  EmployerPartner,
  RecruiterCareerIdentity,
  RecruiterCareerMatchResult,
  RecruiterConversationMessage,
  RecruiterOwnedJob,
  RecruiterRetrievalMode,
} from "@/packages/contracts/src";
import styles from "./page.module.css";

type EmployerPartnerListResponse = {
  items: EmployerPartner[];
};

type RecruiterListResponse = {
  employerPartnerId: string;
  items: RecruiterCareerIdentity[];
};

type RecruiterProfileResponse = {
  recruiter: RecruiterCareerIdentity;
};

type RecruiterAccessStatusResponse = {
  hasAccess: boolean;
  grant: {
    status: "pending" | "approved" | "denied" | "expired" | "revoked";
  } | null;
};

type RecruiterJobsListResponse = {
  jobs: RecruiterOwnedJob[];
  recruiterCareerIdentityId: string;
};

type RecruiterMatchResponse = {
  results: RecruiterCareerMatchResult[];
};

type RecruiterChatResponse = {
  assistantMessage: RecruiterConversationMessage;
  conversation: {
    id: string;
  };
  userMessage: RecruiterConversationMessage;
};

type AccessState = "none" | "pending" | "approved" | "denied" | "expired" | "revoked" | "unauthenticated";

const DEFAULT_REQUESTED_SCOPES = [
  "view_jobs",
  "chat_about_jobs",
  "match_against_my_career_id",
  "request_review",
] as const;

function statusLabel(state: AccessState) {
  if (state === "approved") {
    return "Approved";
  }
  if (state === "pending") {
    return "Pending approval";
  }
  if (state === "denied") {
    return "Denied";
  }
  if (state === "expired") {
    return "Expired";
  }
  if (state === "revoked") {
    return "Revoked";
  }
  if (state === "unauthenticated") {
    return "Sign in required";
  }

  return "Not connected";
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await response.json();

  if (!response.ok) {
    const message =
      (typeof payload?.message === "string" && payload.message) ||
      (typeof payload?.error === "string" && payload.error) ||
      "Request failed.";
    throw new Error(message);
  }

  return payload as T;
}

export function RecruiterMarketplacePanel() {
  const [partners, setPartners] = useState<EmployerPartner[]>([]);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [recruiters, setRecruiters] = useState<RecruiterCareerIdentity[]>([]);
  const [recruitersError, setRecruitersError] = useState<string | null>(null);
  const [selectedRecruiterId, setSelectedRecruiterId] = useState<string>("");
  const [selectedRecruiter, setSelectedRecruiter] = useState<RecruiterCareerIdentity | null>(null);
  const [accessState, setAccessState] = useState<AccessState>("none");
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [isRequestingAccess, setIsRequestingAccess] = useState(false);
  const [jobs, setJobs] = useState<RecruiterOwnedJob[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<RecruiterCareerMatchResult[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [chatMode, setChatMode] = useState<RecruiterRetrievalMode>("recruiter_jobs");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<RecruiterConversationMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  );

  useEffect(() => {
    let mounted = true;
    setPartnerError(null);

    void fetchJson<EmployerPartnerListResponse>("/api/v1/employer-partners", {
      cache: "no-store",
      method: "GET",
    })
      .then((payload) => {
        if (!mounted) {
          return;
        }

        setPartners(payload.items);
        if (!selectedPartnerId && payload.items.length > 0) {
          setSelectedPartnerId(payload.items[0]!.id);
        }
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        setPartnerError(error instanceof Error ? error.message : "Employer partners are unavailable.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPartnerId) {
      setRecruiters([]);
      setSelectedRecruiterId("");
      return;
    }

    let mounted = true;
    setRecruitersError(null);
    setRecruiters([]);
    setSelectedRecruiterId("");
    setSelectedRecruiter(null);
    setAccessState("none");
    setAccessMessage(null);
    setJobs([]);
    setMatchResults([]);
    setChatMessages([]);
    setConversationId(null);

    void fetchJson<RecruiterListResponse>(`/api/v1/employer-partners/${selectedPartnerId}/recruiters`, {
      cache: "no-store",
      method: "GET",
    })
      .then((payload) => {
        if (!mounted) {
          return;
        }

        setRecruiters(payload.items);
        if (payload.items.length > 0) {
          setSelectedRecruiterId(payload.items[0]!.id);
        }
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        setRecruitersError(error instanceof Error ? error.message : "Recruiters are unavailable.");
      });

    return () => {
      mounted = false;
    };
  }, [selectedPartnerId]);

  async function refreshAccessStatus(recruiterCareerIdentityId: string) {
    setAccessMessage(null);

    try {
      const response = await fetch(`/api/v1/recruiters/${recruiterCareerIdentityId}/access-status`, {
        cache: "no-store",
        credentials: "include",
        method: "GET",
      });
      const payload = await response.json();

      if (response.status === 401) {
        setAccessState("unauthenticated");
        setJobs([]);
        return;
      }

      if (!response.ok) {
        throw new Error(
          (typeof payload?.message === "string" && payload.message) || "Access status unavailable.",
        );
      }

      const status = payload as RecruiterAccessStatusResponse;
      if (status.hasAccess && status.grant?.status === "approved") {
        setAccessState("approved");
        await loadRecruiterJobs(recruiterCareerIdentityId);
        return;
      }

      setAccessState(status.grant?.status ?? "none");
      setJobs([]);
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Access status unavailable.");
    }
  }

  useEffect(() => {
    if (!selectedRecruiterId) {
      setSelectedRecruiter(null);
      return;
    }

    let mounted = true;

    void fetchJson<RecruiterProfileResponse>(`/api/v1/recruiters/${selectedRecruiterId}`, {
      cache: "no-store",
      method: "GET",
    })
      .then(async (payload) => {
        if (!mounted) {
          return;
        }

        setSelectedRecruiter(payload.recruiter);
        await refreshAccessStatus(payload.recruiter.id);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }

        setAccessMessage(error instanceof Error ? error.message : "Recruiter profile unavailable.");
      });

    return () => {
      mounted = false;
    };
  }, [selectedRecruiterId]);

  async function requestAccess() {
    if (!selectedRecruiter) {
      return;
    }

    setIsRequestingAccess(true);
    setAccessMessage(null);

    try {
      await fetchJson<{ grant: { status: string } }>(
        `/api/v1/recruiters/${selectedRecruiter.id}/access-requests`,
        {
          body: JSON.stringify({
            requestMessage: "Requesting recruiter access for role alignment and review.",
            requestedScopes: DEFAULT_REQUESTED_SCOPES,
          }),
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      await refreshAccessStatus(selectedRecruiter.id);
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : "Access request failed.");
    } finally {
      setIsRequestingAccess(false);
    }
  }

  async function loadRecruiterJobs(recruiterCareerIdentityId: string) {
    setJobsError(null);

    try {
      const payload = await fetchJson<RecruiterJobsListResponse>(
        `/api/v1/recruiters/${recruiterCareerIdentityId}/jobs`,
        {
          cache: "no-store",
          credentials: "include",
          method: "GET",
        },
      );

      setJobs(payload.jobs);
    } catch (error) {
      setJobs([]);
      setJobsError(error instanceof Error ? error.message : "Recruiter jobs unavailable.");
    }
  }

  async function loadMatches() {
    if (!selectedRecruiter || accessState !== "approved") {
      return;
    }

    setIsLoadingMatches(true);
    setMatchError(null);

    try {
      const payload = await fetchJson<RecruiterMatchResponse>(
        `/api/v1/recruiters/${selectedRecruiter.id}/match-career-id`,
        {
          body: JSON.stringify({
            limit: 5,
          }),
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      setMatchResults(payload.results);
    } catch (error) {
      setMatchResults([]);
      setMatchError(error instanceof Error ? error.message : "Matching is unavailable.");
    } finally {
      setIsLoadingMatches(false);
    }
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedRecruiter || accessState !== "approved") {
      return;
    }

    const message = chatInput.trim();
    if (!message) {
      return;
    }

    setIsSendingChat(true);
    setChatError(null);

    try {
      const payload = await fetchJson<RecruiterChatResponse>(
        `/api/v1/recruiters/${selectedRecruiter.id}/chat`,
        {
          body: JSON.stringify({
            conversationId,
            message,
            mode: chatMode,
          }),
          credentials: "include",
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      setConversationId(payload.conversation.id);
      setChatMessages((current) => [...current, payload.userMessage, payload.assistantMessage]);
      setChatInput("");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Recruiter chat failed.");
    } finally {
      setIsSendingChat(false);
    }
  }

  return (
    <section className={styles.recruiterMarketplace} aria-label="Find recruiters" id="find-recruiters">
      <span className={styles.recruiterFeatureTab}>Find Recruiters</span>
      <div className={styles.recruiterMarketplaceHeader}>
        <h2>Find Recruiters</h2>
        <p>
          Discover partner recruiters, request scoped access, and run recruiter-owned job alignment
          workflows.
        </p>
      </div>

      {partnerError ? <p className={styles.recruiterError}>{partnerError}</p> : null}

      <div className={styles.recruiterPartnerPicker}>
        <label htmlFor="recruiter-partner-select">Employer partner</label>
        <select
          id="recruiter-partner-select"
          value={selectedPartnerId}
          onChange={(event) => setSelectedPartnerId(event.target.value)}
        >
          {partners.map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.displayName}
            </option>
          ))}
        </select>
      </div>

      {recruitersError ? <p className={styles.recruiterError}>{recruitersError}</p> : null}

      {recruiters.length > 0 ? (
        <div className={styles.recruiterCardGrid}>
          {recruiters.map((recruiter) => (
            <button
              key={recruiter.id}
              className={`${styles.recruiterCard} ${
                recruiter.id === selectedRecruiterId ? styles.recruiterCardActive : ""
              }`}
              onClick={() => setSelectedRecruiterId(recruiter.id)}
              type="button"
            >
              <span className={styles.recruiterName}>{recruiter.displayName}</span>
              <span className={styles.recruiterRole}>{recruiter.recruiterRoleTitle}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.recruiterMuted}>No recruiters are available for this partner yet.</p>
      )}

      {selectedRecruiter ? (
        <article className={styles.recruiterProfileSurface}>
          <div className={styles.recruiterProfileTop}>
            <div>
              <h3>{selectedRecruiter.displayName}</h3>
              <p>{selectedRecruiter.recruiterRoleTitle}</p>
            </div>
            <span className={styles.recruiterStatusPill}>{statusLabel(accessState)}</span>
          </div>
          <p className={styles.recruiterBio}>{selectedRecruiter.bio}</p>
          {selectedPartner ? (
            <p className={styles.recruiterMeta}>
              Partner: <strong>{selectedPartner.displayName}</strong>
            </p>
          ) : null}

          {accessMessage ? <p className={styles.recruiterError}>{accessMessage}</p> : null}

          {accessState !== "approved" ? (
            <div className={styles.recruiterAccessActions}>
              <button
                className={styles.recruiterActionButton}
                disabled={isRequestingAccess || accessState === "pending"}
                onClick={requestAccess}
                type="button"
              >
                {accessState === "pending"
                  ? "Access requested"
                  : isRequestingAccess
                  ? "Requesting access..."
                  : "Request recruiter access"}
              </button>
              <p className={styles.recruiterMuted}>
                Approval unlocks recruiter-owned jobs, scoped chat, and Career ID matching.
              </p>
            </div>
          ) : (
            <div className={styles.recruiterWorkspace}>
              <section className={styles.recruiterPane}>
                <div className={styles.recruiterPaneHeader}>
                  <h4>Recruiter-owned openings</h4>
                  <span>{jobs.length} roles</span>
                </div>
                {jobsError ? <p className={styles.recruiterError}>{jobsError}</p> : null}
                {jobs.length === 0 ? (
                  <p className={styles.recruiterMuted}>No visible openings in this recruiter scope.</p>
                ) : (
                  <ul className={styles.recruiterList}>
                    {jobs.map((job) => (
                      <li key={job.id}>
                        <strong>{job.title}</strong>
                        <span>{[job.location, job.department].filter(Boolean).join(" • ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={styles.recruiterPane}>
                <div className={styles.recruiterPaneHeader}>
                  <h4>Career ID alignment</h4>
                  <button
                    className={styles.recruiterActionButtonSecondary}
                    disabled={isLoadingMatches}
                    onClick={() => void loadMatches()}
                    type="button"
                  >
                    {isLoadingMatches ? "Running match..." : "Run match"}
                  </button>
                </div>
                {matchError ? <p className={styles.recruiterError}>{matchError}</p> : null}
                {matchResults.length === 0 ? (
                  <p className={styles.recruiterMuted}>Run recruiter match to view ranked fit.</p>
                ) : (
                  <ul className={styles.recruiterList}>
                    {matchResults.map((result) => (
                      <li key={result.jobId}>
                        <strong>{result.fitSummary}</strong>
                        <span>
                          {result.jobId} • Score {Math.round(result.score * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={styles.recruiterPane}>
                <div className={styles.recruiterPaneHeader}>
                  <h4>Recruiter-scoped chat</h4>
                </div>
                <label className={styles.recruiterChatModeLabel} htmlFor="recruiter-chat-mode">
                  Chat mode
                </label>
                <select
                  id="recruiter-chat-mode"
                  value={chatMode}
                  onChange={(event) => setChatMode(event.target.value as RecruiterRetrievalMode)}
                >
                  <option value="recruiter_jobs">recruiter_jobs</option>
                  <option value="recruiter_match">recruiter_match</option>
                  <option value="recruiter_review">recruiter_review</option>
                </select>

                <div className={styles.recruiterChatLog}>
                  {chatMessages.length === 0 ? (
                    <p className={styles.recruiterMuted}>
                      Ask about roles, alignment, gaps, or recruiter review recommendations.
                    </p>
                  ) : (
                    chatMessages.map((message) => (
                      <article key={message.id} className={styles.recruiterChatMessage}>
                        <h5>{message.role === "job_seeker" ? "You" : "Recruiter"}</h5>
                        <p>{message.content}</p>
                      </article>
                    ))
                  )}
                </div>

                {chatError ? <p className={styles.recruiterError}>{chatError}</p> : null}

                <form className={styles.recruiterChatComposer} onSubmit={sendChat}>
                  <input
                    aria-label="Recruiter chat message"
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="What jobs align best to my Career ID?"
                    value={chatInput}
                  />
                  <button disabled={isSendingChat} type="submit">
                    {isSendingChat ? "Sending..." : "Send"}
                  </button>
                </form>
              </section>
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
