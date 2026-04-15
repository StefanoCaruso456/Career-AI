import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  emitA2AProtocolEvent: vi.fn(),
  emitAgentHandoffEvent: vi.fn(),
  handleExternalRecruiterAgentPost: vi.fn(),
  traceAgentHandoff: vi.fn(),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/app/api/a2a/agents/recruiter/handler", () => ({
  handleExternalRecruiterAgentPost: mocks.handleExternalRecruiterAgentPost,
}));

vi.mock("@/lib/agent-handoff-tracing", () => ({
  emitAgentHandoffEvent: mocks.emitAgentHandoffEvent,
  traceAgentHandoff: mocks.traceAgentHandoff,
}));

vi.mock("@/lib/a2a/protocol-runtime", () => ({
  emitA2AProtocolEvent: mocks.emitA2AProtocolEvent,
}));

vi.mock("@/lib/tracing", () => ({
  getRequestTraceContext: vi.fn(() => ({
    requestId: "req_123",
    runId: "route_run_123",
    traceId: "trace_123",
  })),
  updateRequestTraceContext: mocks.updateRequestTraceContext,
}));

import { searchEmployerCandidatesViaRecruiterAgentBoundary } from "./recruiter-product-search";

describe("searchEmployerCandidatesViaRecruiterAgentBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "Career AI Employer Search Gateway|careerai.gateway.employer_search|recruiter=ext-secret";

    mocks.emitA2AProtocolEvent.mockResolvedValue(null);
    mocks.traceAgentHandoff.mockImplementation(async ({ invoke }) => invoke());
    mocks.handleExternalRecruiterAgentPost.mockResolvedValue(
      new Response(
        JSON.stringify({
          agentType: "recruiter",
          artifacts: [],
          completedAt: "2026-04-15T00:00:22.000Z",
          error: null,
          errors: [],
          messageId: "msg_123",
          metadata: {
            callerServiceName: "Career AI Employer Search Gateway",
            correlationId: "corr_123",
            durationMs: 22,
            endpoint: "/api/a2a/agents/recruiter",
            quota: null,
            traceId: "trace_123",
          },
          nextActions: [],
          ok: true,
          operation: "candidate_search",
          protocolVersion: "a2a.v1",
          receiverAgentId: "careerai.gateway.employer_search",
          requestId: "req_123",
          result: {
            assistantMessage: "I found strong candidates.",
            candidates: [],
            diagnostics: {
              candidateCount: 10,
              filteredOutCount: 5,
              highCredibilityCount: 3,
              parsedSkillCount: 2,
              searchLatencyMs: 12,
            },
            generatedAt: "2026-04-15T00:00:00.000Z",
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
          },
          runId: "run_child",
          senderAgentId: "careerai.agent.recruiter",
          status: "success",
          taskStatus: "completed",
          traceId: "trace_123",
          version: "a2a.v1",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );
  });

  it("dispatches employer search through the recruiter A2A envelope and handler", async () => {
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
      conversationId: "conv_123",
      correlationId: "corr_123",
      limit: 6,
      prompt: "backend engineer",
      sourceEndpoint: "/api/v1/employer/candidates/search",
    });

    expect(result.totalMatches).toBe(0);
    expect(mocks.handleExternalRecruiterAgentPost).toHaveBeenCalledTimes(1);

    const request = mocks.handleExternalRecruiterAgentPost.mock.calls[0]?.[0] as Request;
    const requestBody = await request.json();

    expect(request.headers.get("authorization")).toBe("Bearer ext-secret");
    expect(requestBody).toMatchObject({
      agentType: "recruiter",
      conversationId: "conv_123",
      messageId: expect.any(String),
      operation: "candidate_search",
      protocolVersion: "a2a.v1",
      receiverAgentId: "careerai.agent.recruiter",
      replyTo: "/api/v1/employer/candidates/search",
      requestId: "req_123",
      senderAgentId: "careerai.gateway.employer_search",
      taskType: "candidate_search",
      traceId: "trace_123",
    });
    expect(mocks.emitA2AProtocolEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "a2a.message.created",
      }),
    );
    expect(mocks.emitA2AProtocolEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "a2a.message.sent",
      }),
    );
    expect(mocks.emitAgentHandoffEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "complete",
        metadata: expect.objectContaining({
          handoffType: "external_a2a_dispatch",
          targetEndpoint: "/api/a2a/agents/recruiter",
        }),
      }),
    );
  });
});
