import { describe, expect, it } from "vitest";
import {
  detectApplyTarget,
  isAutonomousApplySupportedAtsFamily,
  resolveJobApplyTarget,
} from "./resolver";

describe("detectApplyTarget", () => {
  it("detects Workday targets from the job posting URL", () => {
    expect(
      detectApplyTarget({
        jobPostingUrl: "https://wd1.myworkdaysite.com/recruiting/example/job/123",
      }),
    ).toMatchObject({
      atsFamily: "workday",
      matchedRule: "workday_url_or_dom_signature",
    });
  });

  it("falls back to generic hosted form detection when only form-like DOM markers are present", () => {
    expect(
      detectApplyTarget({
        jobPostingUrl: "https://careers.example.com/jobs/123",
        pageHtml: "<html><body><form><input name='email' /></form></body></html>",
      }),
    ).toMatchObject({
      atsFamily: "generic_hosted_form",
      fallbackStrategy: "unsupported_target",
    });
  });

  it("returns unsupported_target when no known markers are available", () => {
    expect(
      detectApplyTarget({
        jobPostingUrl: "https://example.com/careers/123",
      }),
    ).toMatchObject({
      atsFamily: "unsupported_target",
      matchedRule: "no_known_signature",
    });
  });

  it("derives a supported autonomous apply target for queueable Greenhouse jobs", () => {
    expect(
      resolveJobApplyTarget({
        canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
        orchestrationReadiness: true,
      }),
    ).toMatchObject({
      atsFamily: "greenhouse",
      routingMode: "queue_autonomous_apply",
      supportStatus: "supported",
    });
  });

  it("keeps unsupported families on the external-open path even when detection succeeds", () => {
    expect(
      resolveJobApplyTarget({
        canonicalApplyUrl: "https://jobs.lever.co/example/123",
        orchestrationReadiness: true,
      }),
    ).toMatchObject({
      atsFamily: "lever",
      routingMode: "open_external",
      supportStatus: "unsupported",
    });
  });

  it("recognizes the ATS families the runtime can currently automate", () => {
    expect(isAutonomousApplySupportedAtsFamily("workday")).toBe(true);
    expect(isAutonomousApplySupportedAtsFamily("greenhouse")).toBe(true);
    expect(isAutonomousApplySupportedAtsFamily("lever")).toBe(false);
  });
});
