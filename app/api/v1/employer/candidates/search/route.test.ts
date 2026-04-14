import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveVerifiedActor: vi.fn(),
  routedSearch: vi.fn(),
  searchEmployerCandidates: vi.fn(),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/lib/internal-agents/recruiter-product-search", () => ({
  searchEmployerCandidatesViaRecruiterAgentBoundary: mocks.routedSearch,
}));

vi.mock("@/lib/tracing", () => ({
  updateRequestTraceContext: mocks.updateRequestTraceContext,
  withTracedRoute: vi.fn(
    (_options: unknown, handler: (request: Request) => Promise<Response>) => handler,
  ),
}));

vi.mock("@/packages/audit-security/src", async () => {
  const actual = await vi.importActual<typeof import("@/packages/audit-security/src")>(
    "@/packages/audit-security/src",
  );

  return {
    ...actual,
    resolveVerifiedActor: mocks.resolveVerifiedActor,
  };
});

vi.mock("@/packages/recruiter-read-model/src", () => ({
  searchEmployerCandidates: mocks.searchEmployerCandidates,
}));

import { POST } from "./route";

const baseResponse = {
  assistantMessage: "I found strong candidates.",
  candidates: [],
  diagnostics: {
    candidateCount: 12,
    filteredOutCount: 4,
    highCredibilityCount: 2,
    parsedSkillCount: 1,
    searchLatencyMs: 22,
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
};

describe("POST /api/v1/employer/candidates/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routedSearch.mockResolvedValue(baseResponse);
    mocks.searchEmployerCandidates.mockResolvedValue(baseResponse);
  });

  it("delegates recruiter session requests through the recruiter agent boundary", async () => {
    mocks.resolveVerifiedActor.mockResolvedValue({
      actorId: "tal_123",
      actorType: "recruiter_user",
      authMethod: "session",
      identity: {
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
    });

    const response = await POST(
      new Request("http://localhost/api/v1/employer/candidates/search", {
        body: JSON.stringify({
          limit: 6,
          prompt: "backend engineer",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      assistantMessage: "I found strong candidates.",
    });
    expect(mocks.routedSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        actorIdentity: expect.objectContaining({
          roleType: "recruiter",
        }),
        prompt: "backend engineer",
        sourceEndpoint: "/api/v1/employer/candidates/search",
      }),
    );
    expect(mocks.searchEmployerCandidates).not.toHaveBeenCalled();
  });

  it("falls back to the legacy direct search path for public callers", async () => {
    mocks.resolveVerifiedActor.mockResolvedValue({
      actorId: "public_request",
      actorType: "system_service",
      authMethod: "public",
      identity: null,
    });

    const response = await POST(
      new Request("http://localhost/api/v1/employer/candidates/search", {
        body: JSON.stringify({
          limit: 6,
          prompt: "backend engineer",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }) as never,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      assistantMessage: "I found strong candidates.",
    });
    expect(mocks.searchEmployerCandidates).toHaveBeenCalledWith({
      filters: undefined,
      limit: 6,
      prompt: "backend engineer",
    });
    expect(mocks.routedSearch).not.toHaveBeenCalled();
  });
});
