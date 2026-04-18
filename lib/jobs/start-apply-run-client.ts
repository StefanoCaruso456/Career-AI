"use client";

export type ApplyContinuationResult =
  | {
      action: "open_external";
      applyUrl: string;
    }
  | {
      action: "queued";
      applyRunId: string;
      message: string;
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
        error?: string;
      }
    | {
        action?: "queued";
        applyRunId?: string;
        error?: string;
        message?: string;
      };

  if (!response.ok) {
    throw new Error(payload.error || "The application request could not be started.");
  }

  if (payload.action === "queued" && payload.applyRunId) {
    return {
      action: "queued",
      applyRunId: payload.applyRunId,
      message:
        payload.message || "Your application was queued. We will email you when it finishes.",
    };
  }

  if ("applyUrl" in payload && payload.applyUrl) {
    return {
      action: "open_external",
      applyUrl: payload.applyUrl,
    };
  }

  throw new Error("The application request did not return a usable result.");
}
