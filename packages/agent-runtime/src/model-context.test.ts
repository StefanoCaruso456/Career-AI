import { describe, expect, it } from "vitest";
import type { AgentContext } from "./context";
import { buildAgentModelContext } from "./model-context";

const authenticatedAgentContext: AgentContext = {
  actor: {
    appUserId: "app_user_123",
    authProvider: "nextauth",
    authSource: "nextauth_session",
    email: "candidate@example.com",
    id: "user:tal_123",
    kind: "authenticated_user",
    name: "Taylor Candidate",
    preferredPersona: "job_seeker",
    providerUserId: "provider_123",
    roleType: "candidate",
    talentIdentityId: "tal_123",
  },
  ownerId: "user:tal_123",
  preferredPersona: "job_seeker",
  roleType: "candidate",
  run: {
    correlationId: "corr-123",
    runId: "run-123",
    traceRoot: {
      braintrustRootSpanId: null,
      requestId: null,
      routeName: "http.route.chat.post",
      traceId: "trace-123",
    },
  },
};

describe("buildAgentModelContext", () => {
  it("includes safe authenticated user context and recent history", () => {
    const context = buildAgentModelContext({
      agentContext: authenticatedAgentContext,
      currentMessage: "Find me backend roles",
      messages: [
        { content: "Hello there", role: "user" },
        { content: "Hi, how can I help?", role: "assistant" },
        { content: "Find me backend roles", role: "user" },
      ],
    });

    expect(context).toContain("User context:");
    expect(context).toContain("actor_kind: authenticated_user");
    expect(context).toContain("role_type: candidate");
    expect(context).toContain("preferred_persona: job_seeker");
    expect(context).toContain("Recent chat history:");
    expect(context).toContain("- user: Hello there");
    expect(context).not.toContain("Find me backend roles");
  });

  it("keeps guest context sparse", () => {
    const context = buildAgentModelContext({
      agentContext: {
        actor: {
          authSource: "chat_owner_cookie",
          guestSessionId: "guest_123",
          id: "guest:guest_123",
          kind: "guest_user",
          preferredPersona: "employer",
          roleType: null,
        },
        ownerId: "guest:guest_123",
        preferredPersona: "employer",
        roleType: null,
        run: authenticatedAgentContext.run,
      },
      messages: [{ content: "Show me hiring workflows", role: "user" }],
    });

    expect(context).toContain("actor_kind: guest_user");
    expect(context).toContain("identity: guest_session");
    expect(context).toContain("preferred_persona: employer");
    expect(context).not.toContain("guest_123");
  });

  it("limits history to the requested budget and count", () => {
    const context = buildAgentModelContext({
      currentMessage: "Current question",
      historyCharBudget: 120,
      historyMessageLimit: 2,
      messages: [
        { content: "First message that should fall out of the limited budget.", role: "user" },
        { content: "Second message that should be kept.", role: "assistant" },
        { content: "Third message that should also be kept.", role: "user" },
        { content: "Current question", role: "user" },
      ],
    });

    expect(context).toContain("Recent chat history:");
    expect(context).toContain("Second message");
    expect(context).toContain("Third message");
    expect(context).not.toContain("First message");
    expect(context).not.toContain("Current question");
  });
});
