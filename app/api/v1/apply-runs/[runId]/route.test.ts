import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findApplyRunById: vi.fn(),
  getAutonomousApplyStuckInProgressThresholdMinutes: vi.fn(),
  getAutonomousApplyStuckQueuedThresholdMinutes: vi.fn(),
  listApplyRunEventSummariesByRunIds: vi.fn(),
  listApplyRunEvents: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/packages/apply-domain/src", () => ({
  getAutonomousApplyStuckInProgressThresholdMinutes:
    mocks.getAutonomousApplyStuckInProgressThresholdMinutes,
  getAutonomousApplyStuckQueuedThresholdMinutes: mocks.getAutonomousApplyStuckQueuedThresholdMinutes,
}));

vi.mock("@/packages/persistence/src", () => ({
  findApplyRunById: mocks.findApplyRunById,
  listApplyRunEventSummariesByRunIds: mocks.listApplyRunEventSummariesByRunIds,
  listApplyRunEvents: mocks.listApplyRunEvents,
}));

import { GET } from "./route";

describe("GET /api/v1/apply-runs/[runId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_123",
      },
    });
    mocks.getAutonomousApplyStuckQueuedThresholdMinutes.mockReturnValue(20);
    mocks.getAutonomousApplyStuckInProgressThresholdMinutes.mockReturnValue(45);
    mocks.findApplyRunById.mockResolvedValue({
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
    });
    mocks.listApplyRunEvents.mockResolvedValue([
      {
        eventType: "apply_run.submit_application_node",
        id: "apply_event_1",
        message: "Submit action executed.",
        metadataJson: {},
        runId: "apply_run_123",
        state: "submitting",
        stepName: "submit_application_node",
        timestamp: "2026-04-17T12:01:20.000Z",
        traceId: "apply_trace_123",
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

  it("returns apply run detail and timeline for the owning user", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/apply-runs/apply_run_123"), {
      params: Promise.resolve({
        runId: "apply_run_123",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.run).toMatchObject({
      companyName: "Workday",
      id: "apply_run_123",
      status: "submitting",
      timelineSummary: {
        latestEventType: "apply_run.submit_application_node",
        totalEvents: 8,
      },
      traceId: "apply_trace_123",
    });
    expect(payload.events).toHaveLength(1);
  });

  it("returns auth_missing diagnostics when unauthenticated", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/v1/apply-runs/apply_run_123"), {
      params: Promise.resolve({
        runId: "apply_run_123",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      details: {
        diagnostic_reason: "auth_missing",
      },
      error_code: "UNAUTHORIZED",
    });
  });

  it("returns not found for runs owned by a different user", async () => {
    mocks.findApplyRunById.mockResolvedValue({
      adapterId: "workday_primary",
      atsFamily: "workday",
      attemptCount: 1,
      companyName: "Workday",
      completedAt: null,
      createdAt: "2026-04-17T12:00:00.000Z",
      failureCode: null,
      failureMessage: null,
      featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
      id: "apply_run_other",
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
      userId: "user_other",
    });

    const response = await GET(new NextRequest("http://localhost/api/v1/apply-runs/apply_run_other"), {
      params: Promise.resolve({
        runId: "apply_run_other",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error_code).toBe("NOT_FOUND");
  });

  it("returns not found when the run id does not exist", async () => {
    mocks.findApplyRunById.mockRejectedValue(new Error("not found"));

    const response = await GET(new NextRequest("http://localhost/api/v1/apply-runs/missing"), {
      params: Promise.resolve({
        runId: "missing",
      }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error_code).toBe("NOT_FOUND");
  });
});
