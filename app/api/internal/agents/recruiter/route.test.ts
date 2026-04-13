import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
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

function createRecruiterContext() {
  return {
    aggregate: {
      privacySettings: {
        allow_public_share_link: false,
        default_share_profile_id: null,
      },
      soulRecord: {
        id: "sr_456",
      },
      talentIdentity: {
        display_name: "Riley Recruiter",
        id: "tal_recruiter_123",
      },
    },
    onboarding: {
      currentStep: 5,
      profile: {},
      profileCompletionPercent: 90,
      roleType: "recruiter",
      status: "completed",
    },
    user: {
      authProvider: "google",
      createdAt: "2026-04-13T00:00:00.000Z",
      email: "recruiter@example.com",
      emailVerified: true,
      firstName: "Riley",
      fullName: "Riley Recruiter",
      id: "user_456",
      imageUrl: null,
      lastLoginAt: "2026-04-13T00:00:00.000Z",
      lastName: "Recruiter",
      preferredPersona: "employer",
      providerUserId: "provider_456",
      updatedAt: "2026-04-13T00:00:00.000Z",
    },
  };
}

describe("POST /api/internal/agents/recruiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditStore();
    resetInternalAgentRateLimitStore();
    delete process.env.INTERNAL_AGENT_RECRUITER_ALLOWED_SERVICES;
    mocks.authMock.mockResolvedValue(null);
    mocks.findPersistentContextByUserId.mockResolvedValue(createRecruiterContext());
    mocks.listOrganizationMembershipContextsForUser.mockResolvedValue([
      {
        membership: {
          createdAt: "2026-04-13T00:00:00.000Z",
          id: "org_mem_1",
          organizationId: "org_1",
          role: "member",
          status: "active",
          updatedAt: "2026-04-13T00:00:00.000Z",
          userId: "user_456",
        },
        organization: {
          createdAt: "2026-04-13T00:00:00.000Z",
          id: "org_1",
          name: "Acme Recruiting",
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      },
      {
        membership: {
          createdAt: "2026-04-13T00:00:00.000Z",
          id: "org_mem_2",
          organizationId: "org_2",
          role: "admin",
          status: "active",
          updatedAt: "2026-04-13T00:00:00.000Z",
          userId: "user_456",
        },
        organization: {
          createdAt: "2026-04-13T00:00:00.000Z",
          id: "org_2",
          name: "Beta Talent",
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      },
    ]);
    mocks.generateHomepageAssistantReplyDetailed.mockResolvedValue({
      source: "openai_bounded_loop",
      stepsUsed: 1,
      stopReason: "completed",
      text: "Recruiter sourcing reply",
      toolCallsUsed: 0,
    });
    process.env.INTERNAL_SERVICE_AUTH_TOKENS = "recruiter-runtime=secret-token";
  });

  it("loads recruiter org context and keeps the shared runtime", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/agents/recruiter", {
        body: JSON.stringify({
          message: "Find me strong backend candidates",
          organizationId: "org_2",
          userId: "user_456",
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
      agentType: "recruiter",
      ok: true,
      operation: "respond",
      payload: expect.objectContaining({
        reply: "Recruiter sourcing reply",
      }),
      reply: "Recruiter sourcing reply",
      role: "recruiter",
      stopReason: "completed",
      version: "v1",
    });
    expect(mocks.generateHomepageAssistantReplyDetailed).toHaveBeenCalledWith(
      "Find me strong backend candidates",
      [],
      expect.objectContaining({
        agentContext: expect.objectContaining({
          organizationContext: expect.objectContaining({
            primaryOrganization: expect.objectContaining({
              organizationId: "org_2",
              role: "admin",
            }),
          }),
          preferredPersona: "employer",
          roleType: "recruiter",
        }),
        instructions: expect.stringContaining("internal recruiter agent"),
        runtimeMode: "bounded_loop",
        workflowId: "internal_recruiter_agent",
      }),
    );
  });

  it("denies a verified internal service that is not on the recruiter allowlist", async () => {
    process.env.INTERNAL_AGENT_RECRUITER_ALLOWED_SERVICES = "approved-recruiter-service";

    const response = await POST(
      new Request("http://localhost/api/internal/agents/recruiter", {
        body: JSON.stringify({
          message: "Find me strong backend candidates",
          userId: "user_456",
        }),
        headers: {
          authorization: "Bearer secret-token",
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      agentType: "recruiter",
      error_code: "FORBIDDEN",
      ok: false,
      error: expect.objectContaining({
        code: "FORBIDDEN",
      }),
    });
    expect(mocks.generateHomepageAssistantReplyDetailed).not.toHaveBeenCalled();
  });
});
