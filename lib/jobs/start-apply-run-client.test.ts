import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTONOMOUS_APPLY_QUEUED_MESSAGE } from "./apply-run-messages";
import { startJobApplyRun } from "./start-apply-run-client";

describe("startJobApplyRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns a queued apply run when the autonomous flow is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            action: "queued",
            applyRunId: "apply_run_123",
            message: "Queued in background.",
          }),
          {
            status: 201,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    await expect(
      startJobApplyRun({
        canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
        conversationId: "conversation_123",
        jobId: "job_123",
      }),
    ).resolves.toEqual({
      action: "queued",
      applyRunId: "apply_run_123",
      message: "Queued in background.",
    });
  });

  it("falls back to opening the external application URL when the autonomous flow is disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            action: "open_external",
            applyUrl: "https://jobs.example.com/apply/123",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    await expect(
      startJobApplyRun({
        jobId: "job_123",
      }),
    ).resolves.toEqual({
      action: "open_external",
      applyUrl: "https://jobs.example.com/apply/123",
    });
  });

  it("uses the shared queued status message when the API omits one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            action: "queued",
            applyRunId: "apply_run_456",
          }),
          {
            status: 201,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    await expect(
      startJobApplyRun({
        jobId: "job_456",
      }),
    ).resolves.toEqual({
      action: "queued",
      applyRunId: "apply_run_456",
      message: AUTONOMOUS_APPLY_QUEUED_MESSAGE,
    });
  });

  it("surfaces truthful route error messages when autonomous apply cannot start", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            details: {
              diagnostic_reason: "worker_mode_disabled",
            },
            error_code: "DEPENDENCY_FAILURE",
            message: "One-Click Apply is unavailable because the apply worker is disabled.",
          }),
          {
            status: 503,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    );

    await expect(
      startJobApplyRun({
        jobId: "job_123",
      }),
    ).rejects.toThrow(
      "One-Click Apply is unavailable because the apply worker is disabled.",
    );
  });
});
