import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createAutonomousApplyRun: vi.fn(),
  getAutonomousApplyStuckInProgressThresholdMinutes: vi.fn(),
  getAutonomousApplyStuckQueuedThresholdMinutes: vi.fn(),
  getJobPostingDetails: vi.fn(),
  isAutonomousApplyEnabled: vi.fn(),
  isDatabaseConfigured: vi.fn(),
  kickAutonomousApplyWorker: vi.fn(),
  listApplyRunEventSummariesByRunIds: vi.fn(),
  listApplyRunsByUser: vi.fn(),
  resolveAutonomousApplyDecision: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/packages/apply-domain/src", () => ({
  createAutonomousApplyRun: mocks.createAutonomousApplyRun,
  getAutonomousApplyStuckInProgressThresholdMinutes:
    mocks.getAutonomousApplyStuckInProgressThresholdMinutes,
  getAutonomousApplyStuckQueuedThresholdMinutes:
    mocks.getAutonomousApplyStuckQueuedThresholdMinutes,
  isAutonomousApplyEnabled: mocks.isAutonomousApplyEnabled,
  resolveAutonomousApplyDecision: mocks.resolveAutonomousApplyDecision,
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  getJobPostingDetails: mocks.getJobPostingDetails,
}));

vi.mock("@/packages/apply-runtime/src", () => ({
  kickAutonomousApplyWorker: mocks.kickAutonomousApplyWorker,
}));

vi.mock("@/packages/persistence/src", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
  listApplyRunEventSummariesByRunIds: mocks.listApplyRunEventSummariesByRunIds,
  listApplyRunsByUser: mocks.listApplyRunsByUser,
}));

import { GET, POST } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v1/apply-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_123",
      },
    });
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getAutonomousApplyStuckQueuedThresholdMinutes.mockReturnValue(20);
    mocks.getAutonomousApplyStuckInProgressThresholdMinutes.mockReturnValue(45);
    mocks.listApplyRunsByUser.mockResolvedValue([
      {
        adapterId: "workday_primary",
        atsFamily: "workday",
        attemptCount: 1,
        companyName: "Workday",
        completedAt: null,
        createdAt: "2026-04-17T12:00:00.000Z",
        failureCode: null,
        failureMessage: null,
        featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
        id: "apply_run_123",
        jobId: "job_123",
        jobPostingUrl: "https://example.myworkdayjobs.com/job/123",
        jobTitle: "Product Designer",
        metadataJson: {},
        profileSnapshotId: "profile_snapshot_123",
        startedAt: "2026-04-17T12:01:00.000Z",
        status: "submitting",
        terminalState: null,
        traceId: "apply_trace_123",
        updatedAt: "2026-04-17T12:01:30.000Z",
        userId: "user_123",
      },
    ]);
    mocks.listApplyRunEventSummariesByRunIds.mockResolvedValue([
      {
        latestEventType: "apply_run.submit_application_node",
        latestTimestamp: "2026-04-17T12:01:20.000Z",
        runId: "apply_run_123",
        totalEvents: 8,
      },
    ]);
  });

  it("returns authenticated run status visibility for the signed-in user", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/apply-runs?limit=5"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      companyName: "Workday",
      id: "apply_run_123",
      timelineSummary: {
        latestEventType: "apply_run.submit_application_node",
        totalEvents: 8,
      },
      traceId: "apply_trace_123",
    });
    expect(mocks.listApplyRunsByUser).toHaveBeenCalledWith({
      limit: 5,
      userId: "user_123",
    });
  });

  it("returns auth_missing diagnostics for unauthenticated calls", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/v1/apply-runs"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      details: {
        diagnostic_reason: "auth_missing",
      },
      error_code: "UNAUTHORIZED",
    });
  });

  it("marks stale queued runs as alertable", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-17T13:00:00.000Z").getTime());
    mocks.listApplyRunsByUser.mockResolvedValue([
      {
        adapterId: null,
        atsFamily: null,
        attemptCount: 1,
        companyName: "Workday",
        completedAt: null,
        createdAt: "2026-04-17T12:00:00.000Z",
        failureCode: null,
        failureMessage: null,
        featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
        id: "apply_run_queued",
        jobId: "job_123",
        jobPostingUrl: "https://example.myworkdayjobs.com/job/123",
        jobTitle: "Product Designer",
        metadataJson: {},
        profileSnapshotId: "profile_snapshot_123",
        startedAt: null,
        status: "queued",
        terminalState: null,
        traceId: "apply_trace_queued",
        updatedAt: "2026-04-17T12:05:00.000Z",
        userId: "user_123",
      },
    ]);
    mocks.listApplyRunEventSummariesByRunIds.mockResolvedValue([]);

    const response = await GET(new NextRequest("http://localhost/api/v1/apply-runs"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items[0].alertableState).toBe("stuck_queued");
  });
});

describe("POST /api/v1/apply-runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.isAutonomousApplyEnabled.mockReturnValue(true);
    mocks.getJobPostingDetails.mockResolvedValue({
      applyUrl: "https://example.com/jobs/123",
      canonicalApplyUrl: "https://example.com/jobs/123",
      id: "job_123",
    });
  });

  it("returns open_external for non-Workday targets and does not queue a run", async () => {
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
      new NextRequest("http://localhost/api/v1/apply-runs", {
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
  });

  it("queues Workday runs and starts the inline worker", async () => {
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
        id: "apply_run_queued",
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/v1/apply-runs", {
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
      applyRunId: "apply_run_queued",
      diagnostic: {
        diagnosticReason: "queued_supported_target",
      },
    });
    expect(mocks.kickAutonomousApplyWorker).toHaveBeenCalledTimes(1);
  });
});
