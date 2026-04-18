import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError } from "@/packages/contracts/src";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createAutonomousApplyRun: vi.fn(),
  getJobPostingDetails: vi.fn(),
  isAutonomousApplyEnabled: vi.fn(),
  isDatabaseConfigured: vi.fn(),
  kickAutonomousApplyWorker: vi.fn(),
  recordJobApplyClickEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  resolveWorkdayOnlyAutonomousApplyDecision: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/packages/apply-domain/src", () => ({
  createAutonomousApplyRun: mocks.createAutonomousApplyRun,
  isAutonomousApplyEnabled: mocks.isAutonomousApplyEnabled,
  resolveWorkdayOnlyAutonomousApplyDecision: mocks.resolveWorkdayOnlyAutonomousApplyDecision,
}));

vi.mock("@/packages/apply-runtime/src", () => ({
  kickAutonomousApplyWorker: mocks.kickAutonomousApplyWorker,
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  getJobPostingDetails: mocks.getJobPostingDetails,
}));

vi.mock("@/packages/persistence/src", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
  recordJobApplyClickEvent: mocks.recordJobApplyClickEvent,
}));

vi.mock("@/app/api/chat/route-helpers", () => ({
  resolveChatRouteContext: mocks.resolveChatRouteContext,
}));

import { POST } from "./route";

describe("POST /api/v1/jobs/apply-click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getJobPostingDetails.mockResolvedValue({
      applyUrl: "https://example.myworkdayjobs.com/job/123",
      canonicalApplyUrl: "https://example.myworkdayjobs.com/job/123",
      id: "job_123",
    });
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.isAutonomousApplyEnabled.mockReturnValue(true);
    mocks.recordJobApplyClickEvent.mockResolvedValue("job_apply_123");
    mocks.resolveChatRouteContext.mockResolvedValue({
      ownerId: "owner_123",
    });
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_123",
        authProvider: "google",
        email: "candidate@example.com",
        image: null,
        name: "Casey Candidate",
        providerUserId: "provider_123",
      },
    });
    mocks.resolveWorkdayOnlyAutonomousApplyDecision.mockReturnValue({
      action: "queue_autonomous_apply",
      detection: {
        atsFamily: "workday",
        confidence: 0.99,
        fallbackStrategy: null,
        matchedRule: "workday_url_or_dom_signature",
      },
      diagnosticReason: "queued_workday",
    });
    mocks.createAutonomousApplyRun.mockResolvedValue({
      deduped: false,
      run: {
        id: "apply_run_123",
      },
    });
  });

  it("queues Workday runs when autonomous apply is enabled", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/v1/jobs/apply-click", {
        body: JSON.stringify({
          jobId: "job_123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toMatchObject({
      action: "queued",
      applyRunId: "apply_run_123",
      diagnostic: {
        diagnosticReason: "queued_workday",
      },
    });
    expect(mocks.createAutonomousApplyRun).toHaveBeenCalledTimes(1);
    expect(mocks.kickAutonomousApplyWorker).toHaveBeenCalledTimes(1);
  });

  it("returns open_external for unsupported non-Workday targets without queueing", async () => {
    mocks.resolveWorkdayOnlyAutonomousApplyDecision.mockReturnValue({
      action: "open_external",
      detection: {
        atsFamily: "greenhouse",
        confidence: 0.95,
        fallbackStrategy: "unsupported_target",
        matchedRule: "greenhouse_url_signature",
      },
      diagnosticReason: "unsupported_target_for_autonomous_mode",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/v1/jobs/apply-click", {
        body: JSON.stringify({
          jobId: "job_123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      action: "open_external",
      diagnostic: {
        diagnosticReason: "unsupported_target_for_autonomous_mode",
      },
    });
    expect(mocks.createAutonomousApplyRun).not.toHaveBeenCalled();
    expect(mocks.kickAutonomousApplyWorker).not.toHaveBeenCalled();
  });

  it("returns open_external with a feature-flag-off diagnostic marker", async () => {
    mocks.resolveWorkdayOnlyAutonomousApplyDecision.mockReturnValue({
      action: "open_external",
      detection: null,
      diagnosticReason: "feature_flag_off",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/v1/jobs/apply-click", {
        body: JSON.stringify({
          jobId: "job_123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      action: "open_external",
      diagnostic: {
        diagnosticReason: "feature_flag_off",
      },
    });
    expect(mocks.createAutonomousApplyRun).not.toHaveBeenCalled();
  });

  it("returns a diagnostic marker when queueing requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(
      new NextRequest("http://localhost/api/v1/jobs/apply-click", {
        body: JSON.stringify({
          jobId: "job_123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      details: {
        diagnostic_reason: "auth_missing",
      },
      error_code: "UNAUTHORIZED",
    });
    expect(mocks.createAutonomousApplyRun).not.toHaveBeenCalled();
  });

  it("preserves profile_incomplete diagnostics from the apply domain", async () => {
    mocks.createAutonomousApplyRun.mockRejectedValue(
      new ApiError({
        correlationId: "corr_test",
        details: {
          diagnostic_reason: "profile_incomplete",
          missingFieldKeys: ["resume_cv_file"],
        },
        errorCode: "VALIDATION_FAILED",
        message: "Your reusable application profile is incomplete for this apply flow.",
        status: 422,
      }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/v1/jobs/apply-click", {
        body: JSON.stringify({
          jobId: "job_123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      details: {
        diagnostic_reason: "profile_incomplete",
      },
      error_code: "VALIDATION_FAILED",
    });
  });
});
