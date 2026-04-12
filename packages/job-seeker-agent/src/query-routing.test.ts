import { describe, expect, it } from "vitest";
import { classifyJobSeekerRouting } from "./query-routing";

describe("classifyJobSeekerRouting", () => {
  it("routes current trend questions to search_web", () => {
    const decision = classifyJobSeekerRouting("What are the hottest 10 jobs in tech right now?");

    expect(decision.bucket).toBe("current_external_information");
    expect(decision.preferredTool).toBe("search_web");
    expect(decision.requiresFreshExternalSearch).toBe(true);
    expect(decision.freshness).toBe("day");
  });

  it("keeps static knowledge questions off web search", () => {
    const decision = classifyJobSeekerRouting("What is a product manager?");

    expect(decision.bucket).toBe("static_knowledge");
    expect(decision.preferredTool).toBeNull();
    expect(decision.requiresFreshExternalSearch).toBe(false);
  });

  it("prefers internal jobs tools for platform inventory requests", () => {
    const decision = classifyJobSeekerRouting("Find jobs in our platform for this candidate.");

    expect(decision.bucket).toBe("internal_platform_data");
    expect(decision.preferredTool).toBe("searchJobs");
    expect(decision.requiresFreshExternalSearch).toBe(false);
  });

  it("uses a reasonable non-search route for ambiguous planning questions", () => {
    const decision = classifyJobSeekerRouting("What roles should I target next?");

    expect(decision.bucket).toBe("static_knowledge");
    expect(decision.preferredTool).toBeNull();
  });
});
