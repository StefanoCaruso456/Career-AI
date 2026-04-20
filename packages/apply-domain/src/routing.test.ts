import { describe, expect, it } from "vitest";
import { resolveAutonomousApplyDecision } from "./routing";

describe("resolveAutonomousApplyDecision", () => {
  it("queues autonomous apply for supported Workday targets when enabled", () => {
    const decision = resolveAutonomousApplyDecision({
      autonomousApplyEnabled: true,
      applyTarget: {
        atsFamily: "workday",
        confidence: 0.99,
        matchedRule: "workday_url_or_dom_signature",
        routingMode: "queue_autonomous_apply",
        supportReason: "supported_ats_family",
        supportStatus: "supported",
      },
      targetApplyUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
    });

    expect(decision).toMatchObject({
      action: "queue_autonomous_apply",
      diagnosticReason: "queued_supported_target",
    });
  });

  it("queues autonomous apply for supported Greenhouse targets", () => {
    const decision = resolveAutonomousApplyDecision({
      autonomousApplyEnabled: true,
      applyTarget: {
        atsFamily: "greenhouse",
        confidence: 0.95,
        matchedRule: "greenhouse_url_signature",
        routingMode: "queue_autonomous_apply",
        supportReason: "supported_ats_family",
        supportStatus: "supported",
      },
      targetApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
    });

    expect(decision).toMatchObject({
      action: "queue_autonomous_apply",
      diagnosticReason: "queued_supported_target",
    });
  });

  it("falls back to open_external for unsupported targets", () => {
    const decision = resolveAutonomousApplyDecision({
      autonomousApplyEnabled: true,
      applyTarget: {
        atsFamily: "lever",
        confidence: 0.95,
        matchedRule: "lever_url_signature",
        routingMode: "open_external",
        supportReason: "unsupported_ats_family",
        supportStatus: "unsupported",
      },
      targetApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
    });

    expect(decision).toMatchObject({
      action: "open_external",
      diagnosticReason: "unsupported_target_for_autonomous_mode",
    });
  });

  it("returns feature_flag_off when autonomous apply is disabled", () => {
    const decision = resolveAutonomousApplyDecision({
      autonomousApplyEnabled: false,
      targetApplyUrl: "https://example.myworkdayjobs.com/recruiting/example/job/123",
    });

    expect(decision).toMatchObject({
      action: "open_external",
      diagnosticReason: "feature_flag_off",
    });
  });
});
