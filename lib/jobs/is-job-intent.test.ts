import { describe, expect, it } from "vitest";
import { isJobIntent } from "./is-job-intent";

describe("isJobIntent", () => {
  it("detects title-only search prompts without explicit job nouns", () => {
    expect(isJobIntent("find software engineers")).toBe(true);
    expect(isJobIntent("show product managers in Austin")).toBe(true);
  });

  it("does not over-classify general product questions as job search", () => {
    expect(isJobIntent("what does the agent actually do")).toBe(false);
    expect(isJobIntent("how does this help me get hired faster")).toBe(false);
  });
});
