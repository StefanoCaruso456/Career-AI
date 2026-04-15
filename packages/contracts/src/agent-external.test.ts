import { describe, expect, it } from "vitest";
import {
  externalAgentCardSchema,
  externalAgentDiscoveryResponseSchema,
  externalAgentErrorResponseSchema,
  externalCandidateAgentRequestSchema,
  externalAgentSuccessResponseSchema,
} from "./agent-external";

describe("agent-external contracts", () => {
  it("parses a protocol-grade external candidate request envelope", () => {
    const parsed = externalCandidateAgentRequestSchema.parse({
      agentType: "candidate",
      auth: {
        authType: "external_service_bearer",
        authenticatedSenderId: "external_service:partner-123",
        serviceName: "partner-runtime",
      },
      context: {
        callerName: "partner-runtime",
        correlationId: "corr_123",
        sourceEndpoint: "/partner/candidate",
      },
      messageId: "msg_ext_candidate_123",
      metadata: {
        callerName: "partner-runtime",
      },
      operation: "respond",
      payload: {
        message: "Summarize my profile",
        messages: [],
        talentIdentityId: "tal_123",
      },
      protocolVersion: "a2a.v1",
      receiverAgentId: "careerai.agent.candidate",
      requestId: "req_ext_candidate_123",
      senderAgentId: "external_service:partner-123",
      sentAt: "2026-04-15T00:00:00.000Z",
      taskType: "respond",
      traceId: "trace_123",
      version: "a2a.v1",
    });

    expect(parsed.version).toBe("a2a.v1");
    expect(parsed.messageId).toBe("msg_ext_candidate_123");
    expect(parsed.senderAgentId).toBe("external_service:partner-123");
  });

  it("parses a protocol-grade external success response", () => {
    const parsed = externalAgentSuccessResponseSchema.parse({
      agentType: "recruiter",
      artifacts: [],
      completedAt: "2026-04-15T00:00:22.000Z",
      error: null,
      errors: [],
      messageId: "msg_ext_recruiter_123",
      metadata: {
        callerServiceName: "partner-runtime",
        correlationId: "corr_123",
        durationMs: 22,
        endpoint: "https://career.ai/api/a2a/agents/recruiter",
        quota: null,
        traceId: "trace_123",
      },
      nextActions: [],
      ok: true,
      operation: "respond",
      protocolVersion: "a2a.v1",
      receiverAgentId: "external_service:partner-123",
      requestId: "req_ext_recruiter_123",
      result: {
        presentationSummary: null,
        reply: "Recruiter reply",
        runId: "run_123",
        stepsUsed: 2,
        stopReason: "completed",
        toolCallsUsed: 1,
      },
      runId: "run_123",
      senderAgentId: "careerai.agent.recruiter",
      status: "success",
      taskStatus: "completed",
      traceId: "trace_123",
      version: "a2a.v1",
    });

    expect("reply" in parsed.result ? parsed.result.reply : null).toBe("Recruiter reply");
  });

  it("parses a protocol-grade external error response", () => {
    const parsed = externalAgentErrorResponseSchema.parse({
      agentType: "verifier",
      artifacts: [],
      completedAt: "2026-04-15T00:00:00.000Z",
      error: {
        code: "UNAUTHORIZED",
        correlationId: "corr_123",
        details: null,
        message: "Authentication is required.",
        requestId: "req_ext_verifier_123",
        retryable: false,
      },
      errors: [
        {
          code: "UNAUTHORIZED",
          correlationId: "corr_123",
          details: null,
          message: "Authentication is required.",
          requestId: "req_ext_verifier_123",
          retryable: false,
        },
      ],
      messageId: "msg_ext_verifier_123",
      metadata: {
        callerServiceName: null,
        correlationId: "corr_123",
        durationMs: 0,
        endpoint: "https://career.ai/api/a2a/agents/verifier",
        quota: null,
        traceId: null,
      },
      nextActions: [],
      ok: false,
      operation: "respond",
      protocolVersion: "a2a.v1",
      receiverAgentId: "external_service:partner-123",
      requestId: "req_ext_verifier_123",
      result: null,
      runId: "run_456",
      senderAgentId: "careerai.agent.verifier",
      status: "error",
      taskStatus: "failed",
      traceId: "trace_456",
      version: "a2a.v1",
    });

    expect(parsed.error.code).toBe("UNAUTHORIZED");
    expect(parsed.receiverAgentId).toBe("external_service:partner-123");
  });

  it("parses an external discovery response with cards", () => {
    const parsed = externalAgentDiscoveryResponseSchema.parse({
      agents: [
        externalAgentCardSchema.parse({
          agentId: "careerai.agent.candidate",
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
      protocolVersion: "a2a.v1",
      version: "a2a.v1",
    });

    expect(parsed.agents).toHaveLength(1);
    expect(parsed.agents[0]?.agentId).toBe("careerai.agent.candidate");
  });
});
