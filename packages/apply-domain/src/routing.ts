import type { AtsDetectionResultDto } from "@/packages/contracts/src/apply";
import type { JobApplyTargetDto } from "@/packages/contracts/src/jobs";

export type AutonomousApplyDiagnosticReason =
  | "feature_flag_off"
  | "unsupported_target_for_autonomous_mode"
  | "queued_supported_target"
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
      diagnosticReason: "queued_supported_target";
      detection: AtsDetectionResultDto;
    };

export function resolveAutonomousApplyDecision(args: {
  autonomousApplyEnabled: boolean;
  applyTarget?: JobApplyTargetDto | null;
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

  const target = args.applyTarget ?? null;
  const detection: AtsDetectionResultDto = {
    atsFamily: target?.atsFamily ?? "unsupported_target",
    confidence: target?.confidence ?? 0,
    fallbackStrategy:
      target?.supportStatus === "supported" ? null : "unsupported_target",
    matchedRule: target?.matchedRule ?? "missing_apply_target",
  };

  if (!target || target.supportStatus !== "supported") {
    return {
      action: "open_external",
      detection,
      diagnosticReason: "unsupported_target_for_autonomous_mode",
    };
  }

  return {
    action: "queue_autonomous_apply",
    detection,
    diagnosticReason: "queued_supported_target",
  };
}
