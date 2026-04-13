import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildVerifierAgentContext: vi.fn(),
  generateHomepageAssistantReplyDetailed: vi.fn(),
  summarizePresentation: vi.fn(),
  traceSpan: vi.fn((_options: unknown, callback: () => Promise<unknown>) => callback()),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/app/api/internal/agents/_shared", () => ({
  buildVerifierAgentContext: mocks.buildVerifierAgentContext,
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

vi.mock("@/packages/agent-runtime/src", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/packages/agent-runtime/src")>();

  return {
    ...actual,
    defaultW3CPresentationAdapter: {
      summarize: mocks.summarizePresentation,
    },
  };
});

vi.mock("@/packages/homepage-assistant/src", () => ({
  generateHomepageAssistantReplyDetailed: mocks.generateHomepageAssistantReplyDetailed,
}));

import { POST } from "./route";

describe("POST /api/a2a/agents/verifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXTERNAL_A2A_ENABLED = "true";
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|verifier=ext-secret";
    mocks.buildVerifierAgentContext.mockReturnValue({
      actor: {
        id: "service:partner-123",
        kind: "internal_service",
        preferredPersona: null,
        roleType: null,
        serviceActorId: "partner-123",
        serviceName: "partner-runtime",
      },
      ownerId: "service:partner-123",
      preferredPersona: null,
      roleType: null,
      run: {
        correlationId: "corr_123",
        runId: "run_789",
      },
    });
    mocks.summarizePresentation.mockReturnValue({
      challenge: null,
      definitionId: "presentation_def_1",
      descriptorIds: ["employment_vc"],
      format: "jwt_vp_json",
      hasPresentation: true,
      holderDid: "did:example:holder-123",
    });
    mocks.generateHomepageAssistantReplyDetailed.mockResolvedValue({
      source: "openai_bounded_loop",
      stepsUsed: 1,
      stopReason: "completed",
      text: "External verifier reply",
      toolCallsUsed: 0,
    });
  });

  it("returns verifier results with W3C presentation summary metadata", async () => {
    const response = await POST(
      new Request("https://career.ai/api/a2a/agents/verifier", {
        body: JSON.stringify({
          agentType: "verifier",
          metadata: {
            callerName: "partner-runtime",
          },
          operation: "respond",
          payload: {
            claimId: "claim_123",
            message: "Inspect this presentation",
            messages: [],
            presentation: {
              challenge: "challenge_123",
              descriptorIds: ["employment_vc"],
              definitionId: "presentation_def_1",
              format: "jwt_vp_json",
              holderDid: "did:example:holder-123",
              presentation: {
                vc: "example",
              },
            },
            subjectTalentIdentityId: "tal_123",
            verificationRecordId: "vr_123",
          },
          requestId: "req_ext_verifier_123",
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
      agentType: "verifier",
      ok: true,
      result: {
        presentationSummary: {
          definitionId: "presentation_def_1",
          descriptorIds: ["employment_vc"],
        },
        reply: "External verifier reply",
      },
      taskStatus: "completed",
      version: "a2a.v1",
    });
  });
});
