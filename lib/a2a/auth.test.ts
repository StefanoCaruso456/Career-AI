import { beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import {
  isExternalAgentAuthorizedForAgent,
  resolveVerifiedExternalAgentCaller,
} from "./auth";

describe("a2a auth", () => {
  beforeEach(() => {
    resetAuditStore();
    delete process.env.EXTERNAL_AGENT_AUTH_TOKENS;
  });

  it("authenticates a configured external caller and enforces allowed agents", () => {
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|candidate+verifier=ext-secret";

    const caller = resolveVerifiedExternalAgentCaller({
      agentType: "candidate",
      correlationId: "corr_123",
      request: new Request("http://localhost/api/a2a/agents/candidate", {
        headers: {
          authorization: "Bearer ext-secret",
        },
      }),
    });

    expect(caller.identity.serviceName).toBe("partner-runtime");
    expect(isExternalAgentAuthorizedForAgent(caller, "candidate")).toBe(true);
    expect(isExternalAgentAuthorizedForAgent(caller, "recruiter")).toBe(false);
  });

  it("denies an invalid external bearer token and audits the failure", () => {
    process.env.EXTERNAL_AGENT_AUTH_TOKENS =
      "partner-runtime|partner-123|candidate=ext-secret";

    expect(() =>
      resolveVerifiedExternalAgentCaller({
        agentType: "candidate",
        correlationId: "corr_123",
        request: new Request("http://localhost/api/a2a/agents/candidate", {
          headers: {
            authorization: "Bearer nope",
          },
        }),
      }),
    ).toThrowError(/authentication failed/i);

    expect(
      listAuditEvents().some((event) => event.event_type === "security.external_a2a.auth.denied"),
    ).toBe(true);
  });
});
