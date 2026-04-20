import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTONOMOUS_APPLY_QUEUED_MESSAGE } from "@/lib/jobs/apply-run-messages";
import { ApiError } from "@/packages/contracts/src";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createAutonomousApplyRun: vi.fn(),
  getAutonomousApplyAvailability: vi.fn(),
  getJobPostingDetails: vi.fn(),
  isDatabaseConfigured: vi.fn(),
  kickAutonomousApplyWorker: vi.fn(),
  recordJobApplyClickEvent: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  resolveAutonomousApplyDecision: vi.fn(),
  toAutonomousApplyUnavailableApiError: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/packages/apply-domain/src", () => ({
  createAutonomousApplyRun: mocks.createAutonomousApplyRun,
  getAutonomousApplyAvailability: mocks.getAutonomousApplyAvailability,
  resolveAutonomousApplyDecision: mocks.resolveAutonomousApplyDecision,
  toAutonomousApplyUnavailableApiError: mocks.toAutonomousApplyUnavailableApiError,
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
    mocks.getAutonomousApplyAvailability.mockReturnValue({
      blobStorageDriver: "filesystem",
      canQueueRuns: true,
      diagnosticReason: "available",
      featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
      workerMode: "inline",
    });
    mocks.isDatabaseConfigured.mockReturnValue(true);
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
    mocks.resolveAutonomousApplyDecision.mockReturnValue({
      action: "queue_autonomous_apply",
      detection: {
        atsFamily: "workday",
        confidence: 0.99,
        fallbackStrategy: null,
        matchedRule: "workday_url_or_dom_signature",
      },
      diagnosticReason: "queued_supported_target",
    });
    mocks.createAutonomousApplyRun.mockResolvedValue({
      deduped: false,
      run: {
        id: "apply_run_123",
      },
    });
    mocks.toAutonomousApplyUnavailableApiError.mockImplementation(
      ({ availability, correlationId }) =>
        new ApiError({
          correlationId,
          details: {
            diagnostic_reason: availability.diagnosticReason,
          },
          errorCode:
            availability.diagnosticReason === "feature_flag_off"
              ? "CONFLICT"
              : "DEPENDENCY_FAILURE",
          message: "One-Click Apply is unavailable.",
          status: availability.diagnosticReason === "feature_flag_off" ? 409 : 503,
        }),
    );
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
        diagnosticReason: "queued_supported_target",
      },
      message: AUTONOMOUS_APPLY_QUEUED_MESSAGE,
    });
    expect(mocks.createAutonomousApplyRun).toHaveBeenCalledTimes(1);
    expect(mocks.kickAutonomousApplyWorker).toHaveBeenCalledTimes(1);
  });

  it("returns open_external for unsupported non-Workday targets without queueing", async () => {
    mocks.resolveAutonomousApplyDecision.mockReturnValue({
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

  it("logs structured routing context for click debugging", async () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    mocks.getJobPostingDetails.mockResolvedValue({
      applyTarget: {
        atsFamily: "workday",
        confidence: 0.98,
        matchedRule: "workday_url_or_dom_signature",
        routingMode: "queue_autonomous_apply",
        supportReason: "supported_ats_family",
        supportStatus: "supported",
      },
      applyUrl: "https://example.myworkdayjobs.com/job/123",
      canonicalApplyUrl: "https://example.myworkdayjobs.com/job/123",
      id: "job_123",
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

    expect(response.status).toBe(201);
    expect(consoleInfoSpy).toHaveBeenCalled();

    const routingLog = consoleInfoSpy.mock.calls
      .map((call) => JSON.parse(String(call[0])))
      .find((entry) => entry.span?.eventType === "apply_click.routing_decision");

    expect(routingLog).toMatchObject({
      companyName: null,
      correlationId: expect.any(String),
      jobId: "job_123",
      message: "Autonomous apply click routing evaluated.",
      metadataJson: expect.objectContaining({
        applyTargetAtsFamily: "workday",
        applyTargetSupportStatus: "supported",
        autonomousApplyBlobStorageDriver: "filesystem",
        autonomousApplyCanQueueRuns: true,
        autonomousApplySystemDiagnosticReason: "available",
        autonomousApplyWorkerMode: "inline",
        jobFound: true,
        routingAction: "queue_autonomous_apply",
        routingDiagnosticReason: "queued_supported_target",
        targetApplyUrl: "https://example.myworkdayjobs.com/job/123",
      }),
      schema: "career_ai.apply_trace_log.v1",
      span: expect.objectContaining({
        eventType: "apply_click.routing_decision",
        kind: "step",
        name: "Evaluate apply click routing",
        phase: "routing",
        status: "queue_autonomous_apply",
      }),
    });

    consoleInfoSpy.mockRestore();
  });

  it("fails closed for supported targets when the autonomous system is unavailable", async () => {
    mocks.getAutonomousApplyAvailability.mockReturnValue({
      blobStorageDriver: "filesystem",
      canQueueRuns: false,
      diagnosticReason: "feature_flag_off",
      featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
      workerMode: "inline",
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

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      details: {
        diagnostic_reason: "feature_flag_off",
      },
      error_code: "CONFLICT",
    });
    expect(mocks.createAutonomousApplyRun).not.toHaveBeenCalled();
    expect(mocks.toAutonomousApplyUnavailableApiError).toHaveBeenCalledTimes(1);
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
