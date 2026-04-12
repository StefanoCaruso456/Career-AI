import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAssistantChatMessage: vi.fn(),
  createUserChatMessage: vi.fn(),
  generateHomepageAssistantReply: vi.fn(),
  jsonChatErrorResponse: vi.fn(),
  jsonChatResponse: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  runJobSeekerAgent: vi.fn(),
  searchEmployerCandidates: vi.fn(),
  searchJobsPanel: vi.fn(),
  summarizeChatAttachmentsForAssistant: vi.fn(),
  traceSpan: vi.fn(),
  updateRequestTraceContext: vi.fn(),
  withTracedRoute: vi.fn((_options: unknown, handler: (request: Request) => Promise<Response>) => handler),
}));

vi.mock("@/packages/job-seeker-agent/src", () => ({
  runJobSeekerAgent: mocks.runJobSeekerAgent,
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  searchJobsPanel: mocks.searchJobsPanel,
}));

vi.mock("@/packages/recruiter-read-model/src", () => ({
  searchEmployerCandidates: mocks.searchEmployerCandidates,
}));

vi.mock("@/packages/homepage-assistant/src", () => ({
  generateHomepageAssistantReply: mocks.generateHomepageAssistantReply,
}));

vi.mock("@/packages/chat-domain/src", () => ({
  createAssistantChatMessage: mocks.createAssistantChatMessage,
  createUserChatMessage: mocks.createUserChatMessage,
  summarizeChatAttachmentsForAssistant: mocks.summarizeChatAttachmentsForAssistant,
}));

vi.mock("./route-helpers", () => ({
  jsonChatErrorResponse: mocks.jsonChatErrorResponse,
  jsonChatResponse: mocks.jsonChatResponse,
  resolveChatRouteContext: mocks.resolveChatRouteContext,
  traceSpan: mocks.traceSpan,
  updateRequestTraceContext: mocks.updateRequestTraceContext,
  withTracedRoute: mocks.withTracedRoute,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();

  mocks.resolveChatRouteContext.mockResolvedValue({
    actor: {
      actorType: "session_user",
      cookieValue: null,
      ownerId: "user:test",
      sessionId: "session:test",
      userId: "app_user_123",
    },
    ownerId: "user:test",
    sessionId: "session:test",
    userId: "app_user_123",
  });
  mocks.summarizeChatAttachmentsForAssistant.mockReturnValue([]);
  mocks.createUserChatMessage.mockResolvedValue({
    assistantMessage: null,
    conversation: {
      id: "conversation_123",
      messages: [{ content: "find software engineers", role: "user" }],
      projectId: "project_123",
    },
    userMessage: {
      attachments: [],
      content: "find software engineers",
      createdAt: "2026-04-11T00:00:00.000Z",
      id: "message_user_123",
      role: "user",
    },
    workspace: null,
  });
  mocks.createAssistantChatMessage.mockImplementation(async ({ content }: { content: string }) => ({
    assistantMessage: {
      attachments: [],
      content,
      createdAt: "2026-04-11T00:00:00.000Z",
      id: "message_assistant_123",
      role: "assistant",
    },
    conversation: {
      id: "conversation_123",
      messages: [],
      projectId: "project_123",
    },
    workspace: null,
  }));
  mocks.jsonChatResponse.mockImplementation((payload: unknown, _actor: unknown, init?: ResponseInit) =>
    Response.json(payload, init),
  );
  mocks.jsonChatErrorResponse.mockImplementation(() =>
    Response.json({ error: "unexpected" }, { status: 500 }),
  );
  mocks.traceSpan.mockImplementation(async (_options: unknown, callback: () => Promise<unknown> | unknown) =>
    callback(),
  );
  mocks.withTracedRoute.mockImplementation(
    (_options: unknown, handler: (request: Request) => Promise<Response>) => handler,
  );
});

describe("POST /api/chat", () => {
  it("falls back to deterministic jobs search when the agent throws for a job-seeker prompt", async () => {
    mocks.runJobSeekerAgent.mockRejectedValue(new Error("agent blew up"));
    mocks.searchJobsPanel.mockResolvedValue({
      assistantMessage: "Fallback jobs reply",
      jobs: [],
      rail: { cards: [], emptyState: "No jobs yet." },
    });

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        body: JSON.stringify({
          attachmentIds: [],
          conversationId: null,
          message: "find software engineers",
          persona: "job_seeker",
          projectId: "project_123",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.searchJobsPanel).toHaveBeenCalledTimes(1);
    expect(payload.jobsPanel.assistantMessage).toBe("Fallback jobs reply");
    expect(payload.assistantMessage.content).toBe("Fallback jobs reply");
  });

  it("routes non-job job-seeker prompts through the homepage assistant workflow", async () => {
    mocks.generateHomepageAssistantReply.mockResolvedValue(
      "It helps candidates build a verifiable Career ID.",
    );

    const response = await POST(
      new Request("http://localhost:3000/api/chat", {
        body: JSON.stringify({
          attachmentIds: [],
          conversationId: null,
          message: "What does the agent actually do?",
          persona: "job_seeker",
          projectId: "project_123",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generateHomepageAssistantReply).toHaveBeenCalledWith(
      "What does the agent actually do?",
      [],
    );
    expect(mocks.runJobSeekerAgent).not.toHaveBeenCalled();
    expect(payload.assistantMessage.content).toBe(
      "It helps candidates build a verifiable Career ID.",
    );
  });
});
