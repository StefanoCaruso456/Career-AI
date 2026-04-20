import type { JobApplyTargetDto } from "@/packages/contracts/src";

export function isAutonomousApplySupportedTarget(
  applyTarget: JobApplyTargetDto | null | undefined,
) {
  return applyTarget?.supportStatus === "supported";
}

export function getJobApplyActionLabel(
  applyTarget: JobApplyTargetDto | null | undefined,
) {
  return isAutonomousApplySupportedTarget(applyTarget)
    ? "One-Click Apply"
    : "Open posting";
}
