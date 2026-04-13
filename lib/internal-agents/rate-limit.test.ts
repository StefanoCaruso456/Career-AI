import { afterEach, describe, expect, it } from "vitest";
import {
  consumeInternalAgentQuota,
  resetInternalAgentRateLimitStore,
} from "./rate-limit";

describe("internal agent rate limit", () => {
  afterEach(() => {
    delete process.env.INTERNAL_AGENT_RATE_LIMIT_ENABLED;
    delete process.env.INTERNAL_AGENT_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.INTERNAL_AGENT_RATE_LIMIT_WINDOW_MS;
    resetInternalAgentRateLimitStore();
  });

  it("allows requests under the configured quota and denies the next request", () => {
    process.env.INTERNAL_AGENT_RATE_LIMIT_ENABLED = "true";
    process.env.INTERNAL_AGENT_RATE_LIMIT_MAX_REQUESTS = "2";
    process.env.INTERNAL_AGENT_RATE_LIMIT_WINDOW_MS = "60000";

    const first = consumeInternalAgentQuota({
      agentType: "candidate",
      now: 1_000,
      operation: "respond",
      serviceActorId: "svc_1",
      serviceName: "candidate-runtime",
    });
    const second = consumeInternalAgentQuota({
      agentType: "candidate",
      now: 1_001,
      operation: "respond",
      serviceActorId: "svc_1",
      serviceName: "candidate-runtime",
    });
    const third = consumeInternalAgentQuota({
      agentType: "candidate",
      now: 1_002,
      operation: "respond",
      serviceActorId: "svc_1",
      serviceName: "candidate-runtime",
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.quota).toMatchObject({
      limit: 2,
      remaining: 0,
      windowMs: 60_000,
    });
  });
});
