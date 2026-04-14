import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { resetExternalA2ARateLimitStore } from "@/lib/a2a/rate-limit";

const mocks = vi.hoisted(() => ({
  traceSpan: vi.fn((_options: unknown, callback: () => Promise<unknown>) => callback()),
  updateRequestTraceContext: vi.fn(),
}));

vi.mock("@/lib/tracing", () => ({
  applyTraceResponseHeaders: <T extends Response>(response: T) => response,
  getRequestTraceContext: vi.fn(() => null),
  traceSpan: mocks.traceSpan,
  updateRequestTraceContext: mocks.updateRequestTraceContext,
  withTracedRoute: vi.fn(
    (_options: unknown, handler: (request: Request, context: unknown) => Promise<Response>) => handler,
  ),
}));

import { GET } from "./route";

describe("GET /api/a2a/agents/[agentType]/card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditStore();
    resetExternalA2ARateLimitStore();
    process.env.EXTERNAL_A2A_ENABLED = "true";
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|verifier=ext-secret";
  });

  it("returns an external card for an authorized agent", async () => {
    const response = await GET(
      new Request("https://career.ai/api/a2a/agents/verifier/card", {
        headers: {
          authorization: "Bearer ext-secret",
        },
      }),
      {
        params: Promise.resolve({
          agentType: "verifier",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.card).toMatchObject({
      agentType: "verifier",
      endpoint: "https://career.ai/api/a2a/agents/verifier",
      requiredAuthType: "external_service_bearer",
    });
    expect(
      mocks.traceSpan.mock.calls.some(
        ([options]) =>
          typeof (options as { name?: string }).name === "string" &&
          (options as { name: string }).name.startsWith("agent.handoff."),
      ),
    ).toBe(false);
  });

  it("denies a caller that is not authorized for the requested agent card", async () => {
    const response = await GET(
      new Request("https://career.ai/api/a2a/agents/recruiter/card", {
        headers: {
          authorization: "Bearer ext-secret",
        },
      }),
      {
        params: Promise.resolve({
          agentType: "recruiter",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error_code).toBe("FORBIDDEN");
  });
});
