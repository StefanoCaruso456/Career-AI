import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authMock: vi.fn(),
  findPersistentContextByTalentIdentityId: vi.fn(),
  findPersistentContextByUserId: vi.fn(),
  generateHomepageAssistantReplyDetailed: vi.fn(),
  listOrganizationMembershipContextsForUser: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.authMock,
}));

vi.mock("@/lib/tracing", () => ({
  applyTraceResponseHeaders: <T extends Response>(response: T) => response,
  getRequestTraceContext: vi.fn(() => null),
  updateRequestTraceContext: vi.fn(),
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
    expect(mocks.generateHomepageAssistantReplyDetailed).not.toHaveBeenCalled();
  });

  it("builds a candidate-scoped context on the shared kernel", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/agents/candidate", {
        body: JSON.stringify({
          message: "Summarize my profile",
          messages: [
            {
              content: "Earlier context",
              role: "user",
            },
          ],
          talentIdentityId: "tal_123",
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
      reply: "Candidate summary reply",
      role: "candidate",
      runId: expect.any(String),
      stepsUsed: 2,
      stopReason: "completed",
      toolCallsUsed: 1,
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
  });
});
