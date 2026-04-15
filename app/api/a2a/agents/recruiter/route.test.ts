import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildRecruiterAgentContext: vi.fn(),
  generateHomepageAssistantReplyDetailed: vi.fn(),
  searchEmployerCandidates: vi.fn(),
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

vi.mock("@/packages/recruiter-read-model/src", () => ({
  searchEmployerCandidates: mocks.searchEmployerCandidates,
}));

import { POST } from "./route";

function buildRecruiterEnvelope(overrides?: Record<string, unknown>) {
  return {
    agentType: "recruiter",
    auth: {
      authType: "external_service_bearer",
      authenticatedSenderId: "external_service:partner-123",
      serviceName: "partner-runtime",
    },
    context: {
      callerName: "partner-runtime",
      correlationId: "corr_123",
      sourceEndpoint: "/partner/recruiter",
    },
    messageId: "msg_ext_recruiter_123",
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
    protocolVersion: "a2a.v1",
    receiverAgentId: "careerai.agent.recruiter",
    requestId: "req_ext_recruiter_123",
    senderAgentId: "external_service:partner-123",
    sentAt: "2026-04-15T00:00:00.000Z",
    taskType: "respond",
    traceId: "trace_123",
    version: "a2a.v1",
    ...(overrides ?? {}),
  };
}

function getTraceSpanNames() {
  return mocks.traceSpan.mock.calls.map(
    ([options]) => (options as { name?: string }).name,
  );
}

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
        parentRunId: "route_run_123",
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
    mocks.searchEmployerCandidates.mockResolvedValue({
      assistantMessage: "I found strong candidates.",
      candidates: [],
      diagnostics: {
        candidateCount: 12,
        filteredOutCount: 4,
        highCredibilityCount: 2,
        parsedSkillCount: 1,
        searchLatencyMs: 22,
      },
      generatedAt: "2026-04-15T00:00:22.000Z",
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
  });

  it("returns a recruiter external response for respond operations", async () => {
    const response = await POST(
      new Request("https://career.ai/api/a2a/agents/recruiter", {
        body: JSON.stringify(buildRecruiterEnvelope()),
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
      protocolVersion: "a2a.v1",
      receiverAgentId: "external_service:partner-123",
      result: {
        reply: "External recruiter reply",
        runId: "run_456",
      },
      senderAgentId: "careerai.agent.recruiter",
      status: "success",
      taskStatus: "completed",
      version: "a2a.v1",
    });
    expect(getTraceSpanNames()).toEqual(
      expect.arrayContaining([
        "a2a.message.received",
        "a2a.task.accepted",
        "a2a.task.running",
        "a2a.task.completed",
        "a2a.response.sent",
        "external.a2a.agent.recruiter.respond",
      ]),
    );
  });

  it("supports candidate_search through the same recruiter A2A boundary", async () => {
    const response = await POST(
      new Request("https://career.ai/api/a2a/agents/recruiter", {
        body: JSON.stringify(
          buildRecruiterEnvelope({
            messageId: "msg_ext_recruiter_search_123",
            operation: "candidate_search",
            payload: {
              limit: 6,
              organizationId: "org_123",
              prompt: "backend engineer",
              userId: "user_123",
            },
            requestId: "req_ext_recruiter_search_123",
            taskType: "candidate_search",
          }),
        ),
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
      operation: "candidate_search",
      result: {
        assistantMessage: "I found strong candidates.",
      },
      taskStatus: "completed",
    });
    expect(mocks.searchEmployerCandidates).toHaveBeenCalledWith({
      filters: undefined,
      limit: 6,
      prompt: "backend engineer",
    });
    expect(getTraceSpanNames()).toEqual(
      expect.arrayContaining([
        "a2a.message.received",
        "a2a.task.accepted",
        "a2a.task.running",
        "internal.agent.recruiter.candidate_search",
        "a2a.task.completed",
        "a2a.response.sent",
        "external.a2a.agent.recruiter.candidate_search",
      ]),
    );
  });
});
