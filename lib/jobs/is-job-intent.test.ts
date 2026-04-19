import { describe, expect, it } from "vitest";
import { isJobIntent } from "./is-job-intent";

describe("isJobIntent", () => {
  it("detects title-only search prompts without explicit job nouns", () => {
    expect(isJobIntent("find software engineers")).toBe(true);
    expect(isJobIntent("show product managers in Austin")).toBe(true);
  });

  it("treats short typoed company-role prompts as job intent", () => {
    expect(isJobIntent("nvidia software roels")).toBe(true);
    expect(isJobIntent("open software roles in the USA")).toBe(true);
  });

  it("treats follow-up role refinements as job intent", () => {
    expect(isJobIntent("how about some data science roles")).toBe(true);
  });

  it("does not over-classify general product questions as job search", () => {
    expect(isJobIntent("what does the agent actually do")).toBe(false);
    expect(isJobIntent("how does this help me get hired faster")).toBe(false);
    expect(isJobIntent("what are the core roles in this workflow")).toBe(false);
  });
});
