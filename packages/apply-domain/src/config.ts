import { tmpdir } from "node:os";
import { join } from "node:path";

export const AUTONOMOUS_APPLY_FEATURE_FLAG = "AUTONOMOUS_APPLY_ENABLED";

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

export function getAutonomousApplyLangSmithProjectName() {
  return (
    process.env.AUTONOMOUS_APPLY_LANGSMITH_PROJECT?.trim() ||
    process.env.LANGCHAIN_PROJECT?.trim() ||
    "Career AI Autonomous Apply"
  );
}
