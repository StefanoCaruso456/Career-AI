import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/tracing", () => ({
  traceSpan: vi.fn(async (_options: unknown, callback: () => Promise<unknown> | unknown) =>
    callback(),
  ),
}));

describe("job seeker agent model module", () => {
  it("imports without loading homepage service-only runtime dependencies", async () => {
    const module = await import("./model");

    expect(module.createLiveJobSeekerAgentModel).toBeTypeOf("function");
  });
});
