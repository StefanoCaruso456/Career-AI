import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildRecruiterAgentContext: vi.fn(),
  emitAgentHandoffEvent: vi.fn(),
  searchEmployerCandidates: vi.fn(),
  traceAgentHandoff: vi.fn(),
  traceSpan: vi.fn(),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/app/api/internal/agents/_shared", () => ({
  buildRecruiterAgentContext: mocks.buildRecruiterAgentContext,
}));

vi.mock("@/lib/agent-handoff-tracing", () => ({
  emitAgentHandoffEvent: mocks.emitAgentHandoffEvent,
  traceAgentHandoff: mocks.traceAgentHandoff,
}));

vi.mock("@/lib/tracing", () => ({
  getRequestTraceContext: vi.fn(() => ({
    requestId: "req_123",
  })),
  traceSpan: mocks.traceSpan,
  updateRequestTraceContext: mocks.updateRequestTraceContext,
}));

vi.mock("@/packages/recruiter-read-model/src", () => ({
  searchEmployerCandidates: mocks.searchEmployerCandidates,
}));

import { searchEmployerCandidatesViaRecruiterAgentBoundary } from "./recruiter-product-search";

describe("searchEmployerCandidatesViaRecruiterAgentBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.buildRecruiterAgentContext.mockResolvedValue({
      roleType: "recruiter",
      run: {
        correlationId: "corr_123",
        parentRunId: "run_parent",
        runId: "run_child",
        traceRoot: {
          braintrustRootSpanId: null,
          requestId: "req_123",
          routeName: "http.route.v1.employer.candidates.search.post",
          traceId: "trace_123",
        },
      },
    });
    mocks.searchEmployerCandidates.mockResolvedValue({
      assistantMessage: "I found strong candidates.",
      candidates: [],
      diagnostics: {
        candidateCount: 10,
        filteredOutCount: 5,
        highCredibilityCount: 3,
        parsedSkillCount: 2,
        searchLatencyMs: 12,
      },
      generatedAt: "2026-04-13T00:00:00.000Z",
      panelCount: 0,
      query: {
        filters: {
          certifications: [],
          credibilityThreshold: null,
          education: null,
          industry: null,
          location: null,
          priorEmployers: [],
          skills: [],
          title: undefined,
          verificationStatus: [],
          verifiedExperienceOnly: false,
          workAuthorization: null,
          yearsExperienceMin: null,
        },
        inputMode: "free_text",
        normalizedPrompt: "backend engineer",
        parsedCriteria: {
          industryHints: [],
          location: null,
          priorEmployers: [],
          seniority: null,
          skillKeywords: ["backend"],
          titleHints: [],
          yearsExperienceMin: null,
        },
        prompt: "backend engineer",
      },
      totalMatches: 0,
    });
    mocks.traceSpan.mockImplementation((_options, callback) => callback());
    mocks.traceAgentHandoff.mockImplementation(async ({ invoke }) => invoke());
  });

  it("dispatches recruiter search through traced handoff metadata", async () => {
    const result = await searchEmployerCandidatesViaRecruiterAgentBoundary({
      actorIdentity: {
        appUserId: "user_123",
        authProvider: "google",
        authSource: "nextauth_session",
        email: "recruiter@example.com",
        id: "user:tal_123",
        kind: "authenticated_user",
        name: "Riley Recruiter",
        preferredPersona: "employer",
        providerUserId: "provider_123",
        roleType: "recruiter",
        talentIdentityId: "tal_123",
      },
      correlationId: "corr_123",
      limit: 6,
      prompt: "backend engineer",
      sourceEndpoint: "/api/v1/employer/candidates/search",
    });

    expect(result.totalMatches).toBe(0);
    expect(mocks.updateRequestTraceContext).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: expect.any(String),
      }),
    );
    expect(mocks.buildRecruiterAgentContext).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "corr_123",
        userId: "user_123",
      }),
    );
    expect(mocks.traceAgentHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "dispatch",
        metadata: expect.objectContaining({
          authSubject: "user:tal_123",
          childRunId: "run_child",
          handoffType: "internal_agent_dispatch",
          operation: "candidate_search",
          sourceEndpoint: "/api/v1/employer/candidates/search",
          targetAgentType: "recruiter",
          targetEndpoint: "/api/internal/agents/recruiter",
        }),
      }),
    );
    expect(mocks.emitAgentHandoffEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "start",
      }),
    );
    expect(mocks.emitAgentHandoffEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "authz",
      }),
    );
    expect(mocks.emitAgentHandoffEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "complete",
      }),
    );
  });

  it("emits a denied handoff event when recruiter context cannot be loaded", async () => {
    mocks.buildRecruiterAgentContext.mockRejectedValueOnce(new Error("forbidden"));

    await expect(
      searchEmployerCandidatesViaRecruiterAgentBoundary({
        actorIdentity: {
          appUserId: "user_123",
          authProvider: "google",
          authSource: "nextauth_session",
          email: "recruiter@example.com",
          id: "user:tal_123",
          kind: "authenticated_user",
          name: "Riley Recruiter",
          preferredPersona: "employer",
          providerUserId: "provider_123",
          roleType: "recruiter",
          talentIdentityId: "tal_123",
        },
        correlationId: "corr_123",
        limit: 6,
        prompt: "backend engineer",
        sourceEndpoint: "/api/v1/employer/candidates/search",
      }),
    ).rejects.toThrow("forbidden");

    expect(mocks.emitAgentHandoffEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "denied",
        metadata: expect.objectContaining({
          operation: "candidate_search",
          sourceEndpoint: "/api/v1/employer/candidates/search",
          targetAgentType: "recruiter",
        }),
      }),
    );
    expect(mocks.searchEmployerCandidates).not.toHaveBeenCalled();
  });
});
