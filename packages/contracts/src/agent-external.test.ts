import { describe, expect, it } from "vitest";
import {
  externalAgentCardSchema,
  externalAgentDiscoveryResponseSchema,
  externalAgentErrorResponseSchema,
  externalCandidateAgentRequestSchema,
  externalAgentSuccessResponseSchema,
} from "./agent-external";

describe("agent-external contracts", () => {
  it("parses a versioned external candidate request envelope", () => {
    const parsed = externalCandidateAgentRequestSchema.parse({
      agentType: "candidate",
      metadata: {
        callerName: "partner-runtime",
      },
      operation: "respond",
      payload: {
        message: "Summarize my profile",
        messages: [],
        talentIdentityId: "tal_123",
      },
      requestId: "req_ext_candidate_123",
      version: "a2a.v1",
    });

    expect(parsed.version).toBe("a2a.v1");
    expect(parsed.agentType).toBe("candidate");
  });

  it("parses a normalized external success response", () => {
    const parsed = externalAgentSuccessResponseSchema.parse({
      agentType: "recruiter",
      error: null,
      metadata: {
        callerServiceName: "partner-runtime",
        correlationId: "corr_123",
        durationMs: 22,
        endpoint: "https://career.ai/api/a2a/agents/recruiter",
        quota: null,
        traceId: "trace_123",
      },
      ok: true,
      operation: "respond",
      requestId: "req_ext_recruiter_123",
      result: {
        presentationSummary: null,
        reply: "Recruiter reply",
        runId: "run_123",
        stepsUsed: 2,
        stopReason: "completed",
        toolCallsUsed: 1,
      },
      taskStatus: "completed",
      version: "a2a.v1",
    });

    expect(parsed.result.reply).toBe("Recruiter reply");
  });

  it("parses a normalized external error response", () => {
    const parsed = externalAgentErrorResponseSchema.parse({
      agentType: "verifier",
      error: {
        code: "UNAUTHORIZED",
        correlationId: "corr_123",
        details: null,
        message: "Authentication is required.",
        requestId: "req_ext_verifier_123",
        retryable: false,
      },
      metadata: {
        callerServiceName: null,
        correlationId: "corr_123",
        durationMs: 0,
        endpoint: "https://career.ai/api/a2a/agents/verifier",
        quota: null,
        traceId: null,
      },
      ok: false,
      operation: "respond",
      requestId: "req_ext_verifier_123",
      result: null,
      taskStatus: "failed",
      version: "a2a.v1",
    });

    expect(parsed.error.code).toBe("UNAUTHORIZED");
  });

  it("parses an external discovery response with cards", () => {
    const parsed = externalAgentDiscoveryResponseSchema.parse({
      agents: [
        externalAgentCardSchema.parse({
          agentType: "candidate",
          capabilities: [
            {
              description: "Answer candidate questions.",
              name: "career_guidance",
            },
          ],
          endpoint: "https://career.ai/api/a2a/agents/candidate",
          name: "Career AI Candidate Agent",
          requiredAuthType: "external_service_bearer",
          role: "candidate",
          supportedOperations: ["respond"],
          supportedProtocolVersions: ["a2a.v1"],
          supportedRequestVersions: ["a2a.v1"],
          supportedResponseVersions: ["a2a.v1"],
        }),
      ],
      metadata: {
        correlationId: "corr_123",
        requestId: "req_discovery_123",
      },
      version: "a2a.v1",
    });

    expect(parsed.agents).toHaveLength(1);
  });
});
