import { describe, expect, it } from "vitest";
import { formatJobMatchReason } from "./format-job-match-reason";

describe("formatJobMatchReason", () => {
  it("condenses internal title and skill signals into a short user-facing phrase", () => {
    expect(
      formatJobMatchReason({
        matchSummary: "title aligned with software engineer, skills matched engineers",
      }),
    ).toBe("Strong software engineer fit");
  });

  it("falls back to short generic copy for trusted listings", () => {
    expect(
      formatJobMatchReason({
        matchReasons: ["validated from a trusted source", "fresh posting"],
      }),
    ).toBe("Verified live listing");
  });
});
