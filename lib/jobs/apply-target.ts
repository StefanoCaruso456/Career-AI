import type { JobApplyTargetDto } from "@/packages/contracts/src";

export function isAutonomousApplySupportedTarget(
  applyTarget: JobApplyTargetDto | null | undefined,
  autonomousApplyEnabled = true,
) {
  return autonomousApplyEnabled && applyTarget?.supportStatus === "supported";
}

export function getJobApplyActionLabel(
  applyTarget: JobApplyTargetDto | null | undefined,
  autonomousApplyEnabled = true,
) {
  return isAutonomousApplySupportedTarget(applyTarget, autonomousApplyEnabled)
    ? "One-Click Apply"
    : "Open posting";
}
