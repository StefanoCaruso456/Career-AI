import { beforeEach, describe, expect, it } from "vitest";
import { consumeExternalA2AQuota, resetExternalA2ARateLimitStore } from "./rate-limit";

describe("a2a rate limit", () => {
  beforeEach(() => {
    resetExternalA2ARateLimitStore();
    process.env.EXTERNAL_A2A_RATE_LIMIT_ENABLED = "true";
    process.env.EXTERNAL_A2A_RATE_LIMIT_MAX_REQUESTS = "2";
    process.env.EXTERNAL_A2A_RATE_LIMIT_WINDOW_MS = "60000";
  });

  it("allows requests up to the configured limit and then denies them", () => {
    const first = consumeExternalA2AQuota({
      agentType: "candidate",
      callerId: "partner-123",
      callerName: "partner-runtime",
      now: 1000,
      resource: "candidate:respond",
    });
    const second = consumeExternalA2AQuota({
      agentType: "candidate",
      callerId: "partner-123",
      callerName: "partner-runtime",
      now: 2000,
      resource: "candidate:respond",
    });
    const third = consumeExternalA2AQuota({
      agentType: "candidate",
      callerId: "partner-123",
      callerName: "partner-runtime",
      now: 3000,
      resource: "candidate:respond",
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.quota?.remaining).toBe(0);
  });
});
