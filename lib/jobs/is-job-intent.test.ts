import { describe, expect, it } from "vitest";
import { isJobIntent } from "@/lib/jobs/is-job-intent";

describe("isJobIntent", () => {
  it("returns true for job-related prompts", () => {
    expect(isJobIntent("Can you help me find jobs for product designers?")).toBe(true);
    expect(isJobIntent("Show me open positions in AI recruiting.")).toBe(true);
    expect(isJobIntent("What opportunities should I apply to next?")).toBe(true);
  });

  it("returns false for non-job prompts", () => {
    expect(isJobIntent("What does the agent actually do?")).toBe(false);
    expect(isJobIntent("Summarize my verification workflow.")).toBe(false);
    expect(isJobIntent("")).toBe(false);
  });
});
