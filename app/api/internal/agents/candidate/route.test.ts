import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import { resetInternalAgentRateLimitStore } from "@/lib/internal-agents/rate-limit";

const mocks = vi.hoisted(() => ({
  authMock: vi.fn(),
  findPersistentContextByTalentIdentityId: vi.fn(),
  findPersistentContextByUserId: vi.fn(),
  generateHomepageAssistantReplyDetailed: vi.fn(),
  listOrganizationMembershipContextsForUser: vi.fn(),
  traceSpan: vi.fn((_options: unknown, callback: () => Promise<unknown>) => callback()),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.authMock,
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

vi.mock("@/packages/persistence/src", () => ({
  countPersistedAuditEvents: vi.fn(),
  createAuditEventRecord: vi.fn(),
  findPersistentContextByTalentIdentityId: mocks.findPersistentContextByTalentIdentityId,
  findPersistentContextByUserId: mocks.findPersistentContextByUserId,
  isDatabaseConfigured: vi.fn(() => false),
  listOrganizationMembershipContextsForUser:
    mocks.listOrganizationMembershipContextsForUser,
}));

vi.mock("@/packages/homepage-assistant/src", () => ({
  generateHomepageAssistantReplyDetailed: mocks.generateHomepageAssistantReplyDetailed,
}));

import { POST } from "./route";

function createPersistentContext(args: {
  preferredPersona: "employer" | "job_seeker";
  roleType: string | null;
  talentIdentityId: string;
  userId: string;
}) {
  return {
    aggregate: {
      privacySettings: {
        allow_public_share_link: false,
        default_share_profile_id: null,
      },
      soulRecord: {
        id: "sr_123",
      },
      talentIdentity: {
        display_name: "Taylor Candidate",
        id: args.talentIdentityId,
      },
    },
    onboarding: {
      currentStep: 5,
      profile: {},
      profileCompletionPercent: 82,
      roleType: args.roleType,
      status: "completed",
    },
    user: {
      authProvider: "google",
      createdAt: "2026-04-13T00:00:00.000Z",
      email: "candidate@example.com",
      emailVerified: true,
      firstName: "Taylor",
      fullName: "Taylor Candidate",
      id: args.userId,
      imageUrl: null,
      lastLoginAt: "2026-04-13T00:00:00.000Z",
      lastName: "Candidate",
      preferredPersona: args.preferredPersona,
      providerUserId: "provider_123",
      updatedAt: "2026-04-13T00:00:00.000Z",
    },
  };
}

describe("POST /api/internal/agents/candidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditStore();
    resetInternalAgentRateLimitStore();
    delete process.env.INTERNAL_AGENT_RATE_LIMIT_ENABLED;
    delete process.env.INTERNAL_AGENT_RATE_LIMIT_MAX_REQUESTS;
    delete process.env.INTERNAL_AGENT_RATE_LIMIT_WINDOW_MS;
    delete process.env.INTERNAL_AGENT_ALLOWED_SERVICES;
    delete process.env.INTERNAL_AGENT_CANDIDATE_ALLOWED_SERVICES;
    mocks.authMock.mockResolvedValue(null);
    mocks.findPersistentContextByTalentIdentityId.mockResolvedValue(
      createPersistentContext({
        preferredPersona: "job_seeker",
        roleType: "candidate",
        talentIdentityId: "tal_123",
        userId: "user_123",
      }),
    );
    mocks.listOrganizationMembershipContextsForUser.mockResolvedValue([]);
    mocks.generateHomepageAssistantReplyDetailed.mockResolvedValue({
      source: "openai_bounded_loop",
      stepsUsed: 2,
      stopReason: "completed",
      text: "Candidate summary reply",
      toolCallsUsed: 1,
    });
    process.env.INTERNAL_SERVICE_AUTH_TOKENS = "candidate-runtime=secret-token";
  });

  it("requires verified internal-service auth", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/agents/candidate", {
        body: JSON.stringify({
          message: "Summarize my profile",
          talentIdentityId: "tal_123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error_code).toBe("UNAUTHORIZED");
    expect(payload).toMatchObject({
      agentType: "candidate",
      ok: false,
      operation: "respond",
      version: "v1",
      error: expect.objectContaining({
        code: "UNAUTHORIZED",
        retryable: false,
      }),
    });
    expect(mocks.generateHomepageAssistantReplyDetailed).not.toHaveBeenCalled();
  });

  it("accepts a versioned request envelope and returns a normalized success response", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/agents/candidate", {
        body: JSON.stringify({
          agentType: "candidate",
          metadata: {
            clientVersion: "internal-test",
          },
          operation: "respond",
          payload: {
            message: "Summarize my profile",
            messages: [
              {
                content: "Earlier context",
                role: "user",
              },
            ],
            talentIdentityId: "tal_123",
          },
          requestId: "req_candidate_123",
          version: "v1",
        }),
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      agentType: "candidate",
      metadata: expect.objectContaining({
        callerServiceName: "candidate-runtime",
        endpoint: "/api/internal/agents/candidate",
      }),
      ok: true,
      operation: "respond",
      payload: expect.objectContaining({
        reply: "Candidate summary reply",
      }),
      reply: "Candidate summary reply",
      requestId: "req_candidate_123",
      role: "candidate",
      runId: expect.any(String),
      stepsUsed: 2,
      stopReason: "completed",
      toolCallsUsed: 1,
      version: "v1",
    });
    expect(mocks.generateHomepageAssistantReplyDetailed).toHaveBeenCalledWith(
      "Summarize my profile",
      [],
      expect.objectContaining({
        agentContext: expect.objectContaining({
          ownerId: "user:tal_123",
          preferredPersona: "job_seeker",
          roleType: "candidate",
        }),
        instructions: expect.stringContaining("internal candidate agent"),
        runtimeMode: "bounded_loop",
        workflowId: "internal_candidate_agent",
      }),
    );
    expect(mocks.updateRequestTraceContext).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: "system_service",
        runId: expect.any(String),
      }),
    );
    expect(listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "internal.agent.request.received",
        }),
        expect.objectContaining({
          event_type: "internal.agent.request.completed",
        }),
      ]),
    );
  });

  it("returns a normalized rate-limit denial with quota headers", async () => {
    process.env.INTERNAL_AGENT_RATE_LIMIT_ENABLED = "true";
    process.env.INTERNAL_AGENT_RATE_LIMIT_MAX_REQUESTS = "1";
    process.env.INTERNAL_AGENT_RATE_LIMIT_WINDOW_MS = "60000";

    const request = () =>
      new Request("http://localhost/api/internal/agents/candidate", {
        body: JSON.stringify({
          message: "Summarize my profile",
          talentIdentityId: "tal_123",
        }),
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json",
        },
        method: "POST",
      });

    const firstResponse = await POST(request());
    const secondResponse = await POST(request());
    const secondPayload = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    expect(secondPayload).toMatchObject({
      agentType: "candidate",
      error_code: "RATE_LIMITED",
      ok: false,
      error: expect.objectContaining({
        code: "RATE_LIMITED",
        retryable: true,
      }),
    });
    expect(secondResponse.headers.get("x-rate-limit-limit")).toBe("1");
    expect(secondResponse.headers.get("x-rate-limit-remaining")).toBe("0");
    expect(listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "security.internal_agent.rate_limited",
        }),
      ]),
    );
  });
});
