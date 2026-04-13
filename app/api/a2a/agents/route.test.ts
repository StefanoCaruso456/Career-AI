import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
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
    (_options: unknown, handler: (request: Request) => Promise<Response>) => handler,
  ),
}));

import { GET } from "./route";

describe("GET /api/a2a/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuditStore();
    resetExternalA2ARateLimitStore();
    process.env.EXTERNAL_A2A_ENABLED = "true";
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|candidate+verifier=ext-secret";
    delete process.env.EXTERNAL_A2A_RATE_LIMIT_ENABLED;
  });

  it("returns only the externally discoverable agents the caller is authorized to invoke", async () => {
    const response = await GET(
      new Request("https://career.ai/api/a2a/agents", {
        headers: {
          authorization: "Bearer ext-secret",
        },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.version).toBe("a2a.v1");
    expect(payload.agents.map((agent: { agentType: string }) => agent.agentType)).toEqual([
      "candidate",
      "verifier",
    ]);
  });

  it("denies anonymous discovery access and audits the failure", async () => {
    const response = await GET(
      new Request("https://career.ai/api/a2a/agents"),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error_code).toBe("UNAUTHORIZED");
    expect(
      listAuditEvents().some((event) => event.event_type === "security.external_a2a.auth.denied"),
    ).toBe(true);
  });
});
