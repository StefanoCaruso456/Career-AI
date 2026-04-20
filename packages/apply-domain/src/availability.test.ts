import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAutonomousApplyWorkerMode: vi.fn(),
  getBlobStorageDriverName: vi.fn(),
  isAutonomousApplyEnabled: vi.fn(),
  isDatabaseConfigured: vi.fn(),
}));

vi.mock("./config", async () => {
  const actual = await vi.importActual<typeof import("./config")>("./config");

  return {
    ...actual,
    getAutonomousApplyWorkerMode: mocks.getAutonomousApplyWorkerMode,
    isAutonomousApplyEnabled: mocks.isAutonomousApplyEnabled,
  };
});

vi.mock("@/packages/artifact-domain/src", () => ({
  getBlobStorageDriverName: mocks.getBlobStorageDriverName,
}));

vi.mock("@/packages/persistence/src", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

import {
  getAutonomousApplyAvailability,
  toAutonomousApplyUnavailableApiError,
} from "./availability";

describe("autonomous apply availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAutonomousApplyWorkerMode.mockReturnValue("inline");
    mocks.getBlobStorageDriverName.mockReturnValue("filesystem");
    mocks.isAutonomousApplyEnabled.mockReturnValue(true);
    mocks.isDatabaseConfigured.mockReturnValue(true);
  });

  it("reports queue readiness when the system can run inline autonomous apply", () => {
    expect(getAutonomousApplyAvailability()).toMatchObject({
      blobStorageDriver: "filesystem",
      canQueueRuns: true,
      diagnosticReason: "available",
      workerMode: "inline",
    });
  });

  it("fails closed when the feature flag is off", () => {
    mocks.isAutonomousApplyEnabled.mockReturnValue(false);

    expect(getAutonomousApplyAvailability()).toMatchObject({
      canQueueRuns: false,
      diagnosticReason: "feature_flag_off",
    });
  });

  it("fails closed when the database is unavailable", () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    expect(getAutonomousApplyAvailability()).toMatchObject({
      canQueueRuns: false,
      diagnosticReason: "database_not_configured",
    });
  });

  it("requires shared blob storage for external worker mode", () => {
    mocks.getAutonomousApplyWorkerMode.mockReturnValue("external");

    expect(getAutonomousApplyAvailability()).toMatchObject({
      blobStorageDriver: "filesystem",
      canQueueRuns: false,
      diagnosticReason: "external_worker_requires_shared_blob_storage",
      workerMode: "external",
    });
  });

  it("maps unavailable reasons to truthful API errors", () => {
    const error = toAutonomousApplyUnavailableApiError({
      availability: {
        blobStorageDriver: "filesystem",
        canQueueRuns: false,
        diagnosticReason: "worker_mode_disabled",
        featureFlagName: "AUTONOMOUS_APPLY_ENABLED",
        workerMode: "disabled",
      },
      correlationId: "corr_123",
    });

    expect(error.toJSON()).toMatchObject({
      details: {
        diagnostic_reason: "worker_mode_disabled",
        worker_mode: "disabled",
      },
      error_code: "DEPENDENCY_FAILURE",
      message: "One-Click Apply is unavailable because the apply worker is disabled.",
    });
  });
});
