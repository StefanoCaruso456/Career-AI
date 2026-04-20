import type { ApiError } from "@/packages/contracts/src";
import { ApiError as ApiErrorClass } from "@/packages/contracts/src";
import { getBlobStorageDriverName } from "@/packages/artifact-domain/src";
import { isDatabaseConfigured } from "@/packages/persistence/src";
import {
  AUTONOMOUS_APPLY_FEATURE_FLAG,
  getAutonomousApplyWorkerMode,
  isAutonomousApplyEnabled,
} from "./config";

export type AutonomousApplyAvailabilityDiagnosticReason =
  | "available"
  | "database_not_configured"
  | "external_worker_requires_shared_blob_storage"
  | "feature_flag_off"
  | "worker_mode_disabled";

export type AutonomousApplyAvailability = {
  blobStorageDriver: ReturnType<typeof getBlobStorageDriverName>;
  canQueueRuns: boolean;
  diagnosticReason: AutonomousApplyAvailabilityDiagnosticReason;
  featureFlagName: string;
  workerMode: ReturnType<typeof getAutonomousApplyWorkerMode>;
};

export function getAutonomousApplyAvailability(): AutonomousApplyAvailability {
  const workerMode = getAutonomousApplyWorkerMode();
  const blobStorageDriver = getBlobStorageDriverName();

  if (!isAutonomousApplyEnabled()) {
    return {
      blobStorageDriver,
      canQueueRuns: false,
      diagnosticReason: "feature_flag_off",
      featureFlagName: AUTONOMOUS_APPLY_FEATURE_FLAG,
      workerMode,
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      blobStorageDriver,
      canQueueRuns: false,
      diagnosticReason: "database_not_configured",
      featureFlagName: AUTONOMOUS_APPLY_FEATURE_FLAG,
      workerMode,
    };
  }

  if (workerMode === "disabled") {
    return {
      blobStorageDriver,
      canQueueRuns: false,
      diagnosticReason: "worker_mode_disabled",
      featureFlagName: AUTONOMOUS_APPLY_FEATURE_FLAG,
      workerMode,
    };
  }

  if (workerMode === "external" && blobStorageDriver !== "s3") {
    return {
      blobStorageDriver,
      canQueueRuns: false,
      diagnosticReason: "external_worker_requires_shared_blob_storage",
      featureFlagName: AUTONOMOUS_APPLY_FEATURE_FLAG,
      workerMode,
    };
  }

  return {
    blobStorageDriver,
    canQueueRuns: true,
    diagnosticReason: "available",
    featureFlagName: AUTONOMOUS_APPLY_FEATURE_FLAG,
    workerMode,
  };
}

export function toAutonomousApplyUnavailableApiError(args: {
  availability: AutonomousApplyAvailability;
  correlationId: string;
}): ApiError {
  const { availability } = args;

  if (availability.diagnosticReason === "feature_flag_off") {
    return new ApiErrorClass({
      correlationId: args.correlationId,
      details: {
        diagnostic_reason: availability.diagnosticReason,
        feature_flag: availability.featureFlagName,
      },
      errorCode: "CONFLICT",
      message: "One-Click Apply is currently disabled in this environment.",
      status: 409,
    });
  }

  if (availability.diagnosticReason === "database_not_configured") {
    return new ApiErrorClass({
      correlationId: args.correlationId,
      details: {
        diagnostic_reason: availability.diagnosticReason,
      },
      errorCode: "DEPENDENCY_FAILURE",
      message: "One-Click Apply is unavailable because apply-run persistence is not configured.",
      status: 503,
    });
  }

  if (availability.diagnosticReason === "worker_mode_disabled") {
    return new ApiErrorClass({
      correlationId: args.correlationId,
      details: {
        diagnostic_reason: availability.diagnosticReason,
        worker_mode: availability.workerMode,
      },
      errorCode: "DEPENDENCY_FAILURE",
      message: "One-Click Apply is unavailable because the apply worker is disabled.",
      status: 503,
    });
  }

  return new ApiErrorClass({
    correlationId: args.correlationId,
    details: {
      blob_storage_driver: availability.blobStorageDriver,
      diagnostic_reason: availability.diagnosticReason,
      worker_mode: availability.workerMode,
    },
    errorCode: "DEPENDENCY_FAILURE",
    message: "One-Click Apply is unavailable because external worker mode requires shared blob storage.",
    status: 503,
  });
}
