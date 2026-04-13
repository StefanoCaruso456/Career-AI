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

describe("POST /api/internal/agents/verifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditStore();
    resetInternalAgentRateLimitStore();
    mocks.authMock.mockResolvedValue(null);
    mocks.generateHomepageAssistantReplyDetailed.mockResolvedValue({
      source: "openai_bounded_loop",
      stepsUsed: 2,
      stopReason: "completed",
      text: "Verifier analysis reply",
      toolCallsUsed: 1,
    });
    process.env.INTERNAL_SERVICE_AUTH_TOKENS = "verifier-runtime=secret-token";
  });

  it("accepts a W3C presentation seam payload and returns a typed verifier response", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/agents/verifier", {
        body: JSON.stringify({
          agentType: "verifier",
          operation: "respond",
          payload: {
            message: "Inspect the verification context",
            presentation: {
              definitionId: "presentation_def_1",
              descriptorIds: ["employment_vc"],
              format: "jwt_vp",
              holderDid: "did:example:holder-123",
              presentation: {
                id: "vp_123",
              },
            },
          },
          requestId: "req_verifier_123",
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
      agentType: "verifier",
      ok: true,
      operation: "respond",
      payload: expect.objectContaining({
        reply: "Verifier analysis reply",
      }),
      presentationSummary: {
        definitionId: "presentation_def_1",
        descriptorIds: ["employment_vc"],
        format: "jwt_vp",
        hasPresentation: true,
        holderDid: "did:example:holder-123",
      },
      reply: "Verifier analysis reply",
      requestId: "req_verifier_123",
      role: "verifier",
      stopReason: "completed",
      version: "v1",
    });
    expect(mocks.generateHomepageAssistantReplyDetailed).toHaveBeenCalledWith(
      "Inspect the verification context",
      [],
      expect.objectContaining({
        agentContext: expect.objectContaining({
          actor: expect.objectContaining({
            kind: "internal_service",
            serviceName: "verifier-runtime",
          }),
        }),
        contextPreamble: expect.stringContaining("W3C presentation context:"),
        instructions: expect.stringContaining("internal verifier agent"),
        runtimeMode: "bounded_loop",
        workflowId: "internal_verifier_agent",
      }),
    );
  });
});
