import { describe, expect, it } from "vitest";
import { resolveWorkdayOnlyAutonomousApplyDecision } from "./routing";

describe("resolveWorkdayOnlyAutonomousApplyDecision", () => {
  it("queues autonomous apply for Workday targets when enabled", () => {
    const decision = resolveWorkdayOnlyAutonomousApplyDecision({
      autonomousApplyEnabled: true,
      targetApplyUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
    });

    expect(decision).toMatchObject({
      action: "queue_autonomous_apply",
      diagnosticReason: "queued_workday",
    });
  });

  it("falls back to open_external for non-Workday targets", () => {
    const decision = resolveWorkdayOnlyAutonomousApplyDecision({
      autonomousApplyEnabled: true,
      targetApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
    });

    expect(decision).toMatchObject({
      action: "open_external",
      diagnosticReason: "unsupported_target_for_autonomous_mode",
    });
  });

  it("returns feature_flag_off when autonomous apply is disabled", () => {
    const decision = resolveWorkdayOnlyAutonomousApplyDecision({
      autonomousApplyEnabled: false,
      targetApplyUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
    });

    expect(decision).toMatchObject({
      action: "open_external",
      diagnosticReason: "feature_flag_off",
    });
  });
});
