import { describe, expect, it } from "vitest";
import {
  candidateAgentEnvelopeSchema,
  internalAgentErrorResponseSchema,
  internalAgentSuccessResponseSchema,
} from "./agent-internal";

describe("internal agent contracts", () => {
  it("accepts a versioned candidate request envelope", () => {
    const parsed = candidateAgentEnvelopeSchema.parse({
      agentType: "candidate",
      metadata: {
        clientVersion: "web-internal",
      },
      operation: "respond",
      payload: {
        message: "Summarize my profile",
        talentIdentityId: "tal_123",
      },
      requestId: "req_123",
      version: "v1",
    });

    expect(parsed.version).toBe("v1");
    expect(parsed.agentType).toBe("candidate");
    expect(parsed.payload.talentIdentityId).toBe("tal_123");
  });

  it("validates a successful normalized response envelope", () => {
    const parsed = internalAgentSuccessResponseSchema.parse({
      agentType: "candidate",
      error: null,
      metadata: {
        callerServiceName: "candidate-runtime",
        correlationId: "corr_123",
        durationMs: 85,
        endpoint: "/api/internal/agents/candidate",
        quota: {
          limit: 60,
          remaining: 59,
          resetAt: "2026-04-13T00:01:00.000Z",
          windowMs: 60000,
        },
        traceId: "trace_123",
      },
      ok: true,
      operation: "respond",
      payload: {
        presentationSummary: null,
        reply: "Hello",
        role: "candidate",
        runId: "run_123",
        stepsUsed: 1,
        stopReason: "completed",
        toolCallsUsed: 0,
      },
      presentationSummary: null,
      reply: "Hello",
      requestId: "req_123",
      role: "candidate",
      runId: "run_123",
      stepsUsed: 1,
      stopReason: "completed",
      toolCallsUsed: 0,
      version: "v1",
    });

    expect(parsed.payload.reply).toBe("Hello");
    expect(parsed.role).toBe("candidate");
  });

  it("validates a normalized error envelope", () => {
    const parsed = internalAgentErrorResponseSchema.parse({
      agentType: "candidate",
      correlation_id: "corr_123",
      details: null,
      error: {
        code: "RATE_LIMITED",
        correlationId: "corr_123",
        details: null,
        message: "Too many requests.",
        requestId: "req_123",
        retryable: true,
      },
      error_code: "RATE_LIMITED",
      message: "Too many requests.",
      metadata: {
        callerServiceName: "candidate-runtime",
        correlationId: "corr_123",
        durationMs: 4,
        endpoint: "/api/internal/agents/candidate",
        quota: {
          limit: 1,
          remaining: 0,
          resetAt: "2026-04-13T00:01:00.000Z",
          windowMs: 60000,
        },
        traceId: "trace_123",
      },
      ok: false,
      operation: "respond",
      payload: null,
      requestId: "req_123",
      version: "v1",
    });

    expect(parsed.error.retryable).toBe(true);
    expect(parsed.error_code).toBe("RATE_LIMITED");
  });
});
