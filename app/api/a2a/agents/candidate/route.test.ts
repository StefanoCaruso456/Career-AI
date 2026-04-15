import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import { resetExternalA2ARateLimitStore } from "@/lib/a2a/rate-limit";

const mocks = vi.hoisted(() => ({
  buildCandidateAgentContext: vi.fn(),
  generateHomepageAssistantReplyDetailed: vi.fn(),
  traceSpan: vi.fn((_options: unknown, callback: () => Promise<unknown>) => callback()),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/app/api/internal/agents/_shared", () => ({
  buildCandidateAgentContext: mocks.buildCandidateAgentContext,
}));

vi.mock("@/lib/tracing", () => ({
  applyTraceResponseHeaders: <T extends Response>(response: T) => response,
  getRequestTraceContext: vi.fn(() => null),
  traceSpan: mocks.traceSpan,
  updateRequestTraceContext: mocks.updateRequestTraceContext,
  withTracedRoute: vi.fn(
    (_options: unknown, handler: (request: Request) => Promise<Response>) => handler,
  ),
}));

vi.mock("@/packages/homepage-assistant/src", () => ({
  generateHomepageAssistantReplyDetailed: mocks.generateHomepageAssistantReplyDetailed,
}));

import { POST } from "./route";

function getTraceCallOptions(name: string) {
  const matchingCall = mocks.traceSpan.mock.calls.find(
    ([options]) => (options as { name?: string }).name === name,
  );

  return matchingCall?.[0] as { metadata?: Record<string, unknown>; name?: string } | undefined;
}

function buildCandidateEnvelope(overrides?: Record<string, unknown>) {
  return {
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
    ...(overrides ?? {}),
  };
}

describe("POST /api/a2a/agents/candidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditStore();
    resetExternalA2ARateLimitStore();
    process.env.EXTERNAL_A2A_ENABLED = "true";
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|candidate=ext-secret";
    delete process.env.EXTERNAL_A2A_RATE_LIMIT_ENABLED;
    mocks.buildCandidateAgentContext.mockResolvedValue({
      actor: {
        id: "user:tal_123",
        kind: "authenticated_user",
        preferredPersona: "job_seeker",
        roleType: "candidate",
      },
      organizationContext: null,
      ownerId: "user:tal_123",
      preferredPersona: "job_seeker",
      roleType: "candidate",
      run: {
        correlationId: "corr_123",
        parentRunId: "route_run_123",
        runId: "run_123",
      },
    });
    mocks.generateHomepageAssistantReplyDetailed.mockResolvedValue({
      source: "openai_bounded_loop",
      stepsUsed: 2,
      stopReason: "completed",
      text: "External candidate reply",
      toolCallsUsed: 1,
    });
  });

  it("returns a normalized external success response for an authorized caller", async () => {
    const response = await POST(
      new Request("https://career.ai/api/a2a/agents/candidate", {
        body: JSON.stringify({
          ...buildCandidateEnvelope(),
        }),
        headers: {
          authorization: "Bearer ext-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      agentType: "candidate",
      ok: true,
      operation: "respond",
      protocolVersion: "a2a.v1",
      receiverAgentId: "external_service:partner-123",
      requestId: "req_ext_candidate_123",
      result: {
        reply: "External candidate reply",
        runId: "run_123",
        stopReason: "completed",
      },
      senderAgentId: "careerai.agent.candidate",
      status: "success",
      taskStatus: "completed",
      version: "a2a.v1",
    });
    expect(
      listAuditEvents().some((event) => event.event_type === "external.a2a.request.completed"),
    ).toBe(true);
    expect(
      mocks.traceSpan.mock.calls.map(
        ([options]) => (options as { name?: string }).name,
      ),
    ).toEqual(
      expect.arrayContaining([
        "agent.handoff.start",
        "agent.handoff.authz",
        "agent.handoff.dispatch",
        "agent.handoff.complete",
        "a2a.message.received",
        "a2a.task.accepted",
        "a2a.task.running",
        "a2a.task.completed",
        "a2a.response.sent",
        "external.a2a.agent.candidate.respond",
      ]),
    );
    expect(getTraceCallOptions("agent.handoff.dispatch")).toMatchObject({
      metadata: expect.objectContaining({
        a2a_protocol_version: "a2a.v1",
        a2a_request_id: "req_ext_candidate_123",
        auth_subject: "service:partner-123",
        child_run_id: "run_123",
        handoff_type: "external_a2a_dispatch",
        permission_decision: "allowed",
        target_agent_type: "candidate",
        target_endpoint: "/api/a2a/agents/candidate",
      }),
    });
  });

  it("emits denied handoff metadata when the external caller is not authorized for the target agent", async () => {
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|recruiter=ext-secret";

    const response = await POST(
      new Request("https://career.ai/api/a2a/agents/candidate", {
        body: JSON.stringify({
          ...buildCandidateEnvelope({
            messageId: "msg_ext_candidate_denied",
            requestId: "req_ext_candidate_denied",
          }),
        }),
        headers: {
          authorization: "Bearer ext-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("FORBIDDEN");
    expect(getTraceCallOptions("agent.handoff.denied")).toMatchObject({
      metadata: expect.objectContaining({
        auth_subject: "service:partner-123",
        handoff_reason: "agent_not_authorized_for_caller",
        handoff_type: "external_a2a_dispatch",
        permission_decision: "denied",
        target_agent_type: "candidate",
      }),
    });
  });

  it("returns a normalized external rate-limit denial with quota headers", async () => {
    process.env.EXTERNAL_A2A_RATE_LIMIT_ENABLED = "true";
    process.env.EXTERNAL_A2A_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.EXTERNAL_A2A_RATE_LIMIT_WINDOW_MS = "60000";

    await POST(
      new Request("https://career.ai/api/a2a/agents/candidate", {
        body: JSON.stringify({
          ...buildCandidateEnvelope({
            messageId: "msg_ext_candidate_first",
            requestId: "req_ext_candidate_first",
          }),
        }),
        headers: {
          authorization: "Bearer ext-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    const response = await POST(
      new Request("https://career.ai/api/a2a/agents/candidate", {
        body: JSON.stringify({
          ...buildCandidateEnvelope({
            messageId: "msg_ext_candidate_second",
            requestId: "req_ext_candidate_second",
          }),
        }),
        headers: {
          authorization: "Bearer ext-secret",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error.code).toBe("RATE_LIMITED");
    expect(response.headers.get("x-rate-limit-limit")).toBe("1");
    expect(response.headers.get("x-rate-limit-remaining")).toBe("0");
    expect(getTraceCallOptions("agent.handoff.denied")).toMatchObject({
      metadata: expect.objectContaining({
        handoff_reason: "rate_limited",
        handoff_type: "external_a2a_dispatch",
        permission_decision: "denied",
        target_agent_type: "candidate",
      }),
    });
  });
});
