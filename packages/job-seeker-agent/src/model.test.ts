import { describe, expect, it } from "vitest";

describe("job seeker agent model module", () => {
  it("imports without loading homepage service-only runtime dependencies", async () => {
    const module = await import("./model");

    expect(module.createLiveJobSeekerAgentModel).toBeTypeOf("function");
  });
});
