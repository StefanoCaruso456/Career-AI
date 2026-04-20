"use client";

export type ApplyContinuationResult =
  | {
      action: "open_external";
      applyUrl: string;
      diagnostic?: {
        atsFamily?: string | null;
        diagnosticReason?: string;
        matchedRule?: string | null;
      };
    }
  | {
      action: "queued";
      applyRunId: string;
      message: string;
      diagnostic?: {
        atsFamily?: string | null;
        diagnosticReason?: string;
        matchedRule?: string | null;
      };
    };

export async function startJobApplyRun(args: {
  canonicalApplyUrl?: string | null;
  conversationId?: string | null;
  jobId: string;
  metadata?: Record<string, unknown>;
}): Promise<ApplyContinuationResult> {
  const response = await fetch("/api/v1/jobs/apply-click", {
    body: JSON.stringify({
      canonicalApplyUrl: args.canonicalApplyUrl ?? undefined,
      conversationId: args.conversationId ?? undefined,
      jobId: args.jobId,
      metadata: args.metadata ?? {},
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json()) as
    | {
        action?: "open_external";
        applyUrl?: string | null;
        diagnostic?: {
          atsFamily?: string | null;
          diagnosticReason?: string;
          matchedRule?: string | null;
        };
        error?: string;
        message?: string;
      }
    | {
        action?: "queued";
        applyRunId?: string;
        diagnostic?: {
          atsFamily?: string | null;
          diagnosticReason?: string;
          matchedRule?: string | null;
        };
        error?: string;
        message?: string;
      };

  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || "The application request could not be started.",
    );
  }

  if (payload.action === "queued" && payload.applyRunId) {
    const queuedResult: ApplyContinuationResult = {
      action: "queued",
      applyRunId: payload.applyRunId,
      message:
        payload.message || "Your application was queued. We will email you when it finishes.",
    };

    if (payload.diagnostic) {
      queuedResult.diagnostic = payload.diagnostic;
    }

    return queuedResult;
  }

  if ("applyUrl" in payload && payload.applyUrl) {
    const openExternalResult: ApplyContinuationResult = {
      action: "open_external",
      applyUrl: payload.applyUrl,
    };

    if (payload.diagnostic) {
      openExternalResult.diagnostic = payload.diagnostic;
    }

    return openExternalResult;
  }

  throw new Error("The application request did not return a usable result.");
}
