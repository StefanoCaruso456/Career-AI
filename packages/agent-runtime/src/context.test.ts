import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestTraceContextMock } = vi.hoisted(() => ({
  getRequestTraceContextMock: vi.fn(),
}));

const { listOrganizationMembershipContextsForUserMock } = vi.hoisted(() => ({
  listOrganizationMembershipContextsForUserMock: vi.fn(),
}));

vi.mock("@/lib/tracing", () => ({
  getRequestTraceContext: getRequestTraceContextMock,
}));

vi.mock("@/packages/persistence/src", () => ({
  listOrganizationMembershipContextsForUser: listOrganizationMembershipContextsForUserMock,
}));

import {
  createAgentContext,
  createChildRunContext,
  createRunContext,
  loadAgentOrganizationContext,
} from "@/packages/agent-runtime/src";

describe("agent runtime context helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestTraceContextMock.mockReturnValue(null);
    listOrganizationMembershipContextsForUserMock.mockResolvedValue([]);
  });

  it("creates a run context with a generated run id even without a traced request", () => {
    const runContext = createRunContext({
      correlationId: "corr-123",
    });

    expect(runContext.correlationId).toBe("corr-123");
    expect(runContext.parentRunId).toBeNull();
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
      parentRunId: null,
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
      organizationContext: null,
      ownerId: "user:tal_123",
      preferredPersona: "job_seeker",
      roleType: "candidate",
      run: runContext,
    });
  });

  it("creates a child run context linked to the parent run", () => {
    const parentRunContext = createRunContext({
      correlationId: "corr-123",
      runId: "run-parent-123",
    });

    const childRunContext = createChildRunContext({
      parentRun: parentRunContext,
      runId: "run-child-123",
    });

    expect(childRunContext).toEqual({
      correlationId: "corr-123",
      parentRunId: "run-parent-123",
      runId: "run-child-123",
      traceRoot: {
        braintrustRootSpanId: null,
        requestId: null,
        routeName: null,
        traceId: null,
      },
    });
  });

  it("loads a minimal active organization context for authenticated recruiters", async () => {
    listOrganizationMembershipContextsForUserMock.mockResolvedValue([
      {
        membership: {
          createdAt: "2026-04-13T00:00:00.000Z",
          id: "org_mem_1",
          organizationId: "org_1",
          role: "admin",
          status: "active",
          updatedAt: "2026-04-13T00:00:00.000Z",
          userId: "user_123",
        },
        organization: {
          createdAt: "2026-04-13T00:00:00.000Z",
          id: "org_1",
          name: "Acme Recruiting",
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      },
    ]);

    await expect(
      loadAgentOrganizationContext({
        actor: {
          appUserId: "user_123",
          authProvider: "google",
          authSource: "nextauth_session",
          email: "recruiter@example.com",
          id: "user:tal_123",
          kind: "authenticated_user",
          name: "Riley Recruiter",
          preferredPersona: "employer",
          providerUserId: "provider-123",
          roleType: "recruiter",
          talentIdentityId: "tal_123",
        },
      }),
    ).resolves.toEqual({
      activeMembershipCount: 1,
      memberships: [
        {
          organizationId: "org_1",
          organizationName: "Acme Recruiting",
          role: "admin",
        },
      ],
      primaryOrganization: {
        organizationId: "org_1",
        organizationName: "Acme Recruiting",
        role: "admin",
      },
    });
  });
});
