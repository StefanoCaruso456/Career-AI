import { detectApplyTarget } from "@/packages/apply-adapters/src";
import type { AtsDetectionResultDto } from "@/packages/contracts/src";

export type AutonomousApplyDiagnosticReason =
  | "feature_flag_off"
  | "unsupported_target_for_autonomous_mode"
  | "queued_workday"
  | "auth_missing"
  | "profile_incomplete";

export type AutonomousApplyRoutingDecision =
  | {
      action: "open_external";
      diagnosticReason: "feature_flag_off" | "unsupported_target_for_autonomous_mode";
      detection: AtsDetectionResultDto | null;
    }
  | {
      action: "queue_autonomous_apply";
      diagnosticReason: "queued_workday";
      detection: AtsDetectionResultDto;
    };

export function resolveWorkdayOnlyAutonomousApplyDecision(args: {
  autonomousApplyEnabled: boolean;
  targetApplyUrl: string | null | undefined;
}): AutonomousApplyRoutingDecision {
  if (!args.autonomousApplyEnabled) {
    return {
      action: "open_external",
      detection: null,
      diagnosticReason: "feature_flag_off",
    };
  }

  const normalizedUrl = args.targetApplyUrl?.trim() || "";

  if (!normalizedUrl) {
    return {
      action: "open_external",
      detection: {
        atsFamily: "unsupported_target",
        confidence: 0,
        fallbackStrategy: null,
        matchedRule: "missing_apply_url",
      },
      diagnosticReason: "unsupported_target_for_autonomous_mode",
    };
  }

  const detection = detectApplyTarget({
    jobPostingUrl: normalizedUrl,
  });

  if (detection.atsFamily !== "workday") {
    return {
      action: "open_external",
      detection,
      diagnosticReason: "unsupported_target_for_autonomous_mode",
    };
  }

  return {
    action: "queue_autonomous_apply",
    detection,
    diagnosticReason: "queued_workday",
  };
}
