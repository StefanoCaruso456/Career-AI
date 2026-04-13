import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestTraceContextMock } = vi.hoisted(() => ({
  getRequestTraceContextMock: vi.fn(),
}));

vi.mock("@/lib/tracing", () => ({
  getRequestTraceContext: getRequestTraceContextMock,
}));

import { createAgentContext, createRunContext } from "@/packages/agent-runtime/src";

describe("agent runtime context helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestTraceContextMock.mockReturnValue(null);
  });

  it("creates a run context with a generated run id even without a traced request", () => {
    const runContext = createRunContext({
      correlationId: "corr-123",
    });

    expect(runContext.correlationId).toBe("corr-123");
    expect(runContext.runId).toEqual(expect.any(String));
    expect(runContext.traceRoot).toEqual({
      braintrustRootSpanId: null,
      requestId: null,
      routeName: null,
      traceId: null,
    });
  });

  it("captures the current trace root when one exists", () => {
    getRequestTraceContextMock.mockReturnValue({
      actorType: "session_user",
      braintrustRootSpanId: "braintrust-root-123",
      method: "POST",
      ownerId: "user:tal_123",
      path: "/api/chat",
      requestId: "request-123",
      routeName: "http.route.chat.post",
      runId: null,
      sessionId: "session-123",
      traceDebugRequested: false,
      traceId: "trace-123",
      userId: "user_123",
    });

    const runContext = createRunContext({
      correlationId: "corr-123",
      runId: "run-123",
    });

    expect(runContext).toEqual({
      correlationId: "corr-123",
      runId: "run-123",
      traceRoot: {
        braintrustRootSpanId: "braintrust-root-123",
        requestId: "request-123",
        routeName: "http.route.chat.post",
        traceId: "trace-123",
      },
    });
  });

  it("creates an agent context from the current actor identity and run context", () => {
    const runContext = createRunContext({
      correlationId: "corr-123",
      runId: "run-123",
    });

    const agentContext = createAgentContext({
      actor: {
        appUserId: "user_123",
        authProvider: "google",
        authSource: "nextauth_session",
        email: "person@example.com",
        id: "user:tal_123",
        kind: "authenticated_user",
        name: "Taylor Morgan",
        preferredPersona: "job_seeker",
        providerUserId: "provider-123",
        roleType: "candidate",
        talentIdentityId: "tal_123",
      },
      ownerId: "user:tal_123",
      run: runContext,
    });

    expect(agentContext).toEqual({
      actor: expect.objectContaining({
        id: "user:tal_123",
        kind: "authenticated_user",
      }),
      ownerId: "user:tal_123",
      preferredPersona: "job_seeker",
      roleType: "candidate",
      run: runContext,
    });
  });
});
