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
      requestId: "req_ext_candidate_123",
      result: {
        reply: "External candidate reply",
        runId: "run_123",
        stopReason: "completed",
      },
      taskStatus: "completed",
      version: "a2a.v1",
    });
    expect(
      listAuditEvents().some((event) => event.event_type === "external.a2a.request.completed"),
    ).toBe(true);
  });

  it("returns a normalized external rate-limit denial with quota headers", async () => {
    process.env.EXTERNAL_A2A_RATE_LIMIT_ENABLED = "true";
    process.env.EXTERNAL_A2A_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.EXTERNAL_A2A_RATE_LIMIT_WINDOW_MS = "60000";

    await POST(
      new Request("https://career.ai/api/a2a/agents/candidate", {
        body: JSON.stringify({
          agentType: "candidate",
          operation: "respond",
          payload: {
            message: "First request",
            messages: [],
            talentIdentityId: "tal_123",
          },
          version: "a2a.v1",
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
          agentType: "candidate",
          operation: "respond",
          payload: {
            message: "Second request",
            messages: [],
            talentIdentityId: "tal_123",
          },
          version: "a2a.v1",
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
  });
});
