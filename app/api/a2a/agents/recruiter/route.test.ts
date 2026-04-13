import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildRecruiterAgentContext: vi.fn(),
  generateHomepageAssistantReplyDetailed: vi.fn(),
  traceSpan: vi.fn((_options: unknown, callback: () => Promise<unknown>) => callback()),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/app/api/internal/agents/_shared", () => ({
  buildRecruiterAgentContext: mocks.buildRecruiterAgentContext,
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

describe("POST /api/a2a/agents/recruiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXTERNAL_A2A_ENABLED = "true";
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|recruiter=ext-secret";
    mocks.buildRecruiterAgentContext.mockResolvedValue({
      actor: {
        id: "user:user_123",
        kind: "authenticated_user",
        preferredPersona: "employer",
        roleType: "recruiter",
      },
      organizationContext: {
        activeMembershipCount: 1,
        memberships: [],
        primaryOrganization: {
          organizationId: "org_123",
          organizationName: "Acme",
          role: "owner",
        },
      },
      ownerId: "user:user_123",
      preferredPersona: "employer",
      roleType: "recruiter",
      run: {
        correlationId: "corr_123",
        runId: "run_456",
      },
    });
    mocks.generateHomepageAssistantReplyDetailed.mockResolvedValue({
      source: "openai_bounded_loop",
      stepsUsed: 1,
      stopReason: "completed",
      text: "External recruiter reply",
      toolCallsUsed: 0,
    });
  });

  it("returns a recruiter external response on the shared kernel", async () => {
    const response = await POST(
      new Request("https://career.ai/api/a2a/agents/recruiter", {
        body: JSON.stringify({
          agentType: "recruiter",
          metadata: {
            callerName: "partner-runtime",
          },
          operation: "respond",
          payload: {
            message: "Summarize this recruiter context",
            messages: [],
            organizationId: "org_123",
            userId: "user_123",
          },
          requestId: "req_ext_recruiter_123",
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
      agentType: "recruiter",
      ok: true,
      result: {
        reply: "External recruiter reply",
        runId: "run_456",
      },
      taskStatus: "completed",
      version: "a2a.v1",
    });
  });
});
