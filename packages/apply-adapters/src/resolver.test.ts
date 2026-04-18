import { describe, expect, it } from "vitest";
import { detectApplyTarget } from "./resolver";

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
});
