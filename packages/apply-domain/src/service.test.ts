import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createQueuedApplyRun: vi.fn(),
  ensurePersistentCareerIdentityForSessionUser: vi.fn(),
  findExistingActiveApplyRun: vi.fn(),
  getJobPostingDetails: vi.fn(),
  getMissingRequiredFieldKeys: vi.fn(),
  isDatabaseConfigured: vi.fn(),
  mergeApplicationProfiles: vi.fn(),
  resolveSchemaFamilyForJob: vi.fn(),
}));

vi.mock("@/auth-identity", () => ({
  ensurePersistentCareerIdentityForSessionUser: mocks.ensurePersistentCareerIdentityForSessionUser,
}));

vi.mock("@/lib/application-profiles/defaults", () => ({
  mergeApplicationProfiles: mocks.mergeApplicationProfiles,
}));

vi.mock("@/lib/application-profiles/resolver", () => ({
  resolveSchemaFamilyForJob: mocks.resolveSchemaFamilyForJob,
}));

vi.mock("@/lib/application-profiles/validation", () => ({
  getMissingRequiredFieldKeys: mocks.getMissingRequiredFieldKeys,
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  getJobPostingDetails: mocks.getJobPostingDetails,
}));

vi.mock("@/packages/persistence/src", () => ({
  createQueuedApplyRun: mocks.createQueuedApplyRun,
  findExistingActiveApplyRun: mocks.findExistingActiveApplyRun,
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

import { createAutonomousApplyRun } from "./service";

function baseSessionUser() {
  return {
    appUserId: "user_123",
    authProvider: "google",
    email: "candidate@example.com",
    emailVerified: true,
    image: null,
    name: "Casey Candidate",
    providerUserId: "provider_123",
  };
}

function baseInput() {
  return {
    canonicalApplyUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
    conversationId: "conversation_123",
    jobId: "job_123",
    metadata: {
      source: "jobs_page",
    },
  };
}

function baseProfile() {
  return {
    email: "candidate@example.com",
    first_name: "Casey",
    last_name: "Candidate",
    resume_cv_file: {
      artifactId: "artifact_resume_1",
      fileName: "resume.pdf",
      mimeType: "application/pdf",
      parsingStatus: "READY",
      uploadedAt: "2026-04-17T12:00:00.000Z",
    },
  };
}

describe("createAutonomousApplyRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTONOMOUS_APPLY_ENABLED = "true";
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.ensurePersistentCareerIdentityForSessionUser.mockResolvedValue({
      context: {
        applicationProfiles: {},
        user: {
          id: "user_123",
        },
      },
    });
    mocks.getJobPostingDetails.mockResolvedValue({
      applyUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
      canonicalApplyUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
      companyName: "Workday",
      id: "job_123",
      sourceLabel: "Workday",
      title: "Product Designer",
    });
    mocks.resolveSchemaFamilyForJob.mockReturnValue("workday");
    mocks.mergeApplicationProfiles.mockReturnValue({
      greenhouse_profile: {},
      stripe_profile: {},
      workday_profile: baseProfile(),
    });
    mocks.getMissingRequiredFieldKeys.mockReturnValue([]);
    mocks.findExistingActiveApplyRun.mockResolvedValue(null);
    mocks.createQueuedApplyRun.mockImplementation(async ({ run, snapshot }) => ({
      ...run,
      profileSnapshotId: snapshot.id,
      updatedAt: "2026-04-17T12:00:01.000Z",
    }));
  });

  it("returns an existing active run instead of creating a duplicate", async () => {
    const existingRun = {
      adapterId: null,
      atsFamily: "workday",
      attemptCount: 1,
      companyName: "Workday",
      completedAt: null,
      createdAt: "2026-04-17T12:00:00.000Z",
      failureCode: null,
      failureMessage: null,
      featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
      id: "apply_run_existing",
      jobId: "job_123",
      jobPostingUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
      jobTitle: "Product Designer",
      metadataJson: {},
      profileSnapshotId: "profile_snapshot_existing",
      startedAt: null,
      status: "queued",
      terminalState: null,
      traceId: "apply_trace_existing",
      updatedAt: "2026-04-17T12:00:10.000Z",
      userId: "user_123",
    };
    mocks.findExistingActiveApplyRun.mockResolvedValue(existingRun);

    const result = await createAutonomousApplyRun({
      correlationId: "corr_duplicate_test",
      input: baseInput(),
      sessionUser: baseSessionUser(),
    });

    expect(result).toMatchObject({
      deduped: true,
      run: {
        id: "apply_run_existing",
      },
      snapshot: null,
    });
    expect(mocks.createQueuedApplyRun).not.toHaveBeenCalled();
  });

  it("creates a run with a generated trace_id and correlation metadata", async () => {
    const result = await createAutonomousApplyRun({
      correlationId: "corr_trace_test",
      input: baseInput(),
      sessionUser: baseSessionUser(),
    });

    expect(result.deduped).toBe(false);
    expect(mocks.createQueuedApplyRun).toHaveBeenCalledTimes(1);
    const [firstCall] = mocks.createQueuedApplyRun.mock.calls;
    const run = firstCall?.[0]?.run;
    expect(run).toBeTruthy();
    expect(run.traceId).toMatch(/^apply_trace_/);
    expect(run.metadataJson).toMatchObject({
      correlationId: "corr_trace_test",
      conversationId: "conversation_123",
    });
  });
});
