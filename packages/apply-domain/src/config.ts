import { tmpdir } from "node:os";
import { join } from "node:path";

export const AUTONOMOUS_APPLY_FEATURE_FLAG = "AUTONOMOUS_APPLY_ENABLED";
const DEFAULT_INLINE_WORKER_CONCURRENCY = 1;
const MAX_INLINE_WORKER_CONCURRENCY = 4;
const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const DEFAULT_STEP_TIMEOUT_MS = 15_000;
const DEFAULT_SUBMIT_TIMEOUT_MS = 20_000;
const DEFAULT_CONFIRMATION_TIMEOUT_MS = 25_000;
const DEFAULT_RUN_TIMEOUT_MS = 180_000;
const DEFAULT_ARTIFACT_RETENTION_HOURS = 72;
const DEFAULT_STUCK_QUEUED_THRESHOLD_MINUTES = 20;
const DEFAULT_STUCK_IN_PROGRESS_THRESHOLD_MINUTES = 45;
const DEFAULT_WORKER_POLL_INTERVAL_MS = 5_000;

function isTruthyEnv(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function isAutonomousApplyEnabled() {
  return isTruthyEnv(process.env.AUTONOMOUS_APPLY_ENABLED);
}

export function isAutonomousApplyInlineWorkerEnabled() {
  const configuredValue = process.env.AUTONOMOUS_APPLY_INLINE_WORKER_ENABLED;

  if (configuredValue === undefined) {
    return true;
  }

  return isTruthyEnv(configuredValue);
}

export function getAutonomousApplyWorkerMode() {
  const configuredValue = process.env.AUTONOMOUS_APPLY_WORKER_MODE?.trim().toLowerCase();

  if (configuredValue === "external") {
    return "external" as const;
  }

  if (configuredValue === "disabled") {
    return "disabled" as const;
  }

  if (configuredValue === "inline") {
    return "inline" as const;
  }

  return isAutonomousApplyInlineWorkerEnabled() ? ("inline" as const) : ("external" as const);
}

export function getAutonomousApplyArtifactsDirectory() {
  return (
    process.env.AUTONOMOUS_APPLY_ARTIFACTS_DIR?.trim() ||
    join(tmpdir(), "career-ai-autonomous-apply")
  );
}

export function getAutonomousApplyWorkerBatchSize() {
  const rawValue = Number.parseInt(
    process.env.AUTONOMOUS_APPLY_WORKER_BATCH_SIZE?.trim() || "1",
    10,
  );

  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return 1;
  }

  return Math.min(rawValue, 10);
}

export function getAutonomousApplyWorkerPollIntervalMs() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_WORKER_POLL_INTERVAL_MS,
    DEFAULT_WORKER_POLL_INTERVAL_MS,
  );
}

function readPositiveIntegerEnv(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value?.trim() || "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export function getAutonomousApplyInlineWorkerConcurrency() {
  const configured = readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_INLINE_WORKER_CONCURRENCY,
    DEFAULT_INLINE_WORKER_CONCURRENCY,
  );

  return Math.max(1, Math.min(configured, MAX_INLINE_WORKER_CONCURRENCY));
}

export function getAutonomousApplyNavigationTimeoutMs() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_NAVIGATION_TIMEOUT_MS,
    DEFAULT_NAVIGATION_TIMEOUT_MS,
  );
}

export function getAutonomousApplyStepTimeoutMs() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_STEP_TIMEOUT_MS,
    DEFAULT_STEP_TIMEOUT_MS,
  );
}

export function getAutonomousApplySubmitTimeoutMs() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_SUBMIT_TIMEOUT_MS,
    DEFAULT_SUBMIT_TIMEOUT_MS,
  );
}

export function getAutonomousApplyConfirmationTimeoutMs() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_CONFIRMATION_TIMEOUT_MS,
    DEFAULT_CONFIRMATION_TIMEOUT_MS,
  );
}

export function getAutonomousApplyRunTimeoutMs() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_RUN_TIMEOUT_MS,
    DEFAULT_RUN_TIMEOUT_MS,
  );
}

export function isAutonomousApplyArtifactCleanupEnabled() {
  const configuredValue = process.env.AUTONOMOUS_APPLY_ARTIFACT_CLEANUP_ENABLED;

  if (configuredValue === undefined) {
    return true;
  }

  return isTruthyEnv(configuredValue);
}

export function getAutonomousApplyArtifactRetentionHours() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_ARTIFACT_RETENTION_HOURS,
    DEFAULT_ARTIFACT_RETENTION_HOURS,
  );
}

export function getAutonomousApplyStuckQueuedThresholdMinutes() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_STUCK_QUEUED_MINUTES,
    DEFAULT_STUCK_QUEUED_THRESHOLD_MINUTES,
  );
}

export function getAutonomousApplyStuckInProgressThresholdMinutes() {
  return readPositiveIntegerEnv(
    process.env.AUTONOMOUS_APPLY_STUCK_IN_PROGRESS_MINUTES,
    DEFAULT_STUCK_IN_PROGRESS_THRESHOLD_MINUTES,
  );
}

export function getAutonomousApplyLangSmithProjectName() {
  return (
    process.env.AUTONOMOUS_APPLY_LANGSMITH_PROJECT?.trim() ||
    process.env.LANGCHAIN_PROJECT?.trim() ||
    "Career AI Autonomous Apply"
  );
}
