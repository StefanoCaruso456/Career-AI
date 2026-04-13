import { describe, expect, it } from "vitest";
import { createInMemoryRateLimitProvider } from "./provider";

describe("rate-limit provider", () => {
  it("isolates quota state by namespace", () => {
    const firstProvider = createInMemoryRateLimitProvider("provider-a");
    const secondProvider = createInMemoryRateLimitProvider("provider-b");

    firstProvider.reset();
    secondProvider.reset();

    const denied = [
      firstProvider.consume({
        key: "candidate:respond:svc_1",
        limit: 1,
        now: 1_000,
        windowMs: 60_000,
      }),
      firstProvider.consume({
        key: "candidate:respond:svc_1",
        limit: 1,
        now: 1_001,
        windowMs: 60_000,
      }),
    ][1];

    const isolated = secondProvider.consume({
      key: "candidate:respond:svc_1",
      limit: 1,
      now: 1_001,
      windowMs: 60_000,
    });

    expect(denied.allowed).toBe(false);
    expect(isolated.allowed).toBe(true);
  });
});
