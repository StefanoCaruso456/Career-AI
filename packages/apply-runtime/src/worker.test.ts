import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplyAdapter } from "@/packages/apply-adapters/src";

const mocks = vi.hoisted(() => ({
  claimNextQueuedApplyRun: vi.fn(),
  closeApplyBrowserSession: vi.fn(async () => undefined),
  createApplyRunEventRecord: vi.fn(async ({ event }) => ({
    ...event,
    id: "apply_event_test",
    timestamp: "2026-04-17T12:00:00.000Z",
  })),
  findApplyRunById: vi.fn(),
  findProfileSnapshotById: vi.fn(),
  findPersistentContextByUserId: vi.fn(),
  isAutonomousApplyArtifactCleanupEnabled: vi.fn(() => false),
  isAutonomousApplyInlineWorkerEnabled: vi.fn(() => true),
  getAutonomousApplyInlineWorkerConcurrency: vi.fn(() => 1),
  getAutonomousApplyRunTimeoutMs: vi.fn(() => 60_000),
  getAutonomousApplyWorkerBatchSize: vi.fn(() => 1),
  launchApplyBrowserSession: vi.fn(async () => ({
    browser: {},
    context: {},
    page: {
      locator: vi.fn(() => ({
        count: vi.fn(async () => 0),
      })),
      textContent: vi.fn(async () => ""),
      url: vi.fn(() => "https://example.myworkdayjobs.com/recruiting/example/job/123"),
    },
    sessionId: "apply_browser_test",
  })),
  sendApplyRunTerminalEmail: vi.fn(async () => undefined),
  updateApplyRunRecord: vi.fn(async () => undefined),
}));

vi.mock("@/packages/persistence/src", () => ({
  claimNextQueuedApplyRun: mocks.claimNextQueuedApplyRun,
  createApplyRunEventRecord: mocks.createApplyRunEventRecord,
  findApplyRunById: mocks.findApplyRunById,
  findProfileSnapshotById: mocks.findProfileSnapshotById,
  findPersistentContextByUserId: mocks.findPersistentContextByUserId,
  updateApplyRunRecord: mocks.updateApplyRunRecord,
}));

vi.mock("@/packages/apply-domain/src", () => ({
  getAutonomousApplyInlineWorkerConcurrency: mocks.getAutonomousApplyInlineWorkerConcurrency,
  getAutonomousApplyRunTimeoutMs: mocks.getAutonomousApplyRunTimeoutMs,
  getAutonomousApplyWorkerBatchSize: mocks.getAutonomousApplyWorkerBatchSize,
  isAutonomousApplyArtifactCleanupEnabled: mocks.isAutonomousApplyArtifactCleanupEnabled,
  isAutonomousApplyInlineWorkerEnabled: mocks.isAutonomousApplyInlineWorkerEnabled,
}));

vi.mock("./browser-session", () => ({
  closeApplyBrowserSession: mocks.closeApplyBrowserSession,
  launchApplyBrowserSession: mocks.launchApplyBrowserSession,
}));

vi.mock("./notifications", () => ({
  sendApplyRunTerminalEmail: mocks.sendApplyRunTerminalEmail,
}));

import { runAutonomousApplyWorkerCycle } from "./worker";

describe("autonomous apply worker runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const claimedRun = {
      adapterId: null,
      atsFamily: null,
      attemptCount: 1,
      companyName: "Workday",
      completedAt: null,
      createdAt: "2026-04-17T12:00:00.000Z",
      failureCode: null,
      failureMessage: null,
      featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
      id: "apply_run_worker_1",
      jobId: "job_123",
      jobPostingUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
      jobTitle: "Product Designer",
      metadataJson: {},
      profileSnapshotId: "profile_snapshot_123",
      startedAt: "2026-04-17T12:00:05.000Z",
      status: "preflight_validating",
      terminalState: null,
      traceId: "apply_trace_worker_1",
      updatedAt: "2026-04-17T12:00:05.000Z",
      userId: "user_123",
    };

    mocks.claimNextQueuedApplyRun.mockResolvedValue(claimedRun);
    mocks.findApplyRunById.mockResolvedValue(claimedRun);
    mocks.findProfileSnapshotById.mockResolvedValue({
      contact: {
        countryPhoneCode: "+1",
        email: "candidate@example.com",
        phone: "5551234567",
      },
      createdAt: "2026-04-17T12:00:00.000Z",
      disclosures: {},
      documents: {
        resume: {
          artifactId: "artifact_resume_1",
          fileName: "resume.pdf",
          mimeType: "application/pdf",
          parsingStatus: "QUEUED",
          uploadedAt: "2026-04-17T12:00:00.000Z",
        },
      },
      education: [],
      employerSpecificDeltas: {},
      id: "profile_snapshot_123",
      identity: {
        email: "candidate@example.com",
        firstName: "Casey",
        fullName: "Casey Candidate",
        lastName: "Candidate",
      },
      links: {},
      location: {
        addressLine1: "123 Main St",
        city: "Chicago",
        country: "United States",
        postalCode: "60601",
        region: "IL",
      },
      profileVersion: 1,
      provenance: {
        source: "test",
        sourceUpdatedAt: null,
      },
      schemaFamily: "workday",
      sourceProfile: {
        email: "candidate@example.com",
      },
      sponsorship: {},
      userId: "user_123",
      workEligibility: {},
      workHistory: [],
    });
  });

  it("uses submission_unconfirmed for ambiguous post-submit confirmation and keeps trace_id on events", async () => {
    const adapter: ApplyAdapter = {
      advanceSteps: vi.fn(async () => undefined),
      analyzeForm: vi.fn(async () => []),
      canHandle: vi.fn((target) => target.atsFamily === "workday"),
      classifyFailure: vi.fn(async (_context, error) => ({
        failureCode: "UNKNOWN_RUNTIME_ERROR" as const,
        message: error instanceof Error ? error.message : "Unknown failure",
      })),
      collectArtifacts: vi.fn(async () => []),
      confirmSubmission: vi.fn(async () => ({
        confirmed: false,
        failureCode: "SUBMISSION_NOT_CONFIRMED" as const,
        message: "Submission could not be confirmed.",
      })),
      createMappingPlan: vi.fn(async () => ({
        entries: [],
        unmappedRequiredFields: [],
      })),
      family: "workday",
      fillFields: vi.fn(async () => undefined),
      id: "workday_test_adapter",
      openTarget: vi.fn(async () => undefined),
      preflight: vi.fn(async () => undefined),
      submit: vi.fn(async () => undefined),
      uploadDocuments: vi.fn(async () => undefined),
    };

    await runAutonomousApplyWorkerCycle({
      dependencies: {
        adapterRegistry: [adapter],
        loadUserEmail: async () => "candidate@example.com",
      },
    });

    const updateCalls = (
      mocks.updateApplyRunRecord.mock.calls as Array<
        [
          {
            status?: string;
            terminalState?: string | null;
            traceId?: string | null;
          },
        ]
      >
    ).map((call) => call[0]);
    const finalUpdate = updateCalls.find(
      (call) => call.status === "submission_unconfirmed" && call.terminalState === "submission_unconfirmed",
    );

    expect(finalUpdate).toBeTruthy();
    expect(finalUpdate?.traceId).toBe("apply_trace_worker_1");

    const eventCalls = (
      mocks.createApplyRunEventRecord.mock.calls as Array<
        [
          {
            event: {
              traceId?: string | null;
            };
          },
        ]
      >
    ).map((call) => call[0].event);
    expect(eventCalls.length).toBeGreaterThan(0);
    expect(eventCalls.every((event) => event.traceId === "apply_trace_worker_1")).toBe(true);
  });
});
