import { afterEach, describe, expect, it, vi } from "vitest";
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
});
