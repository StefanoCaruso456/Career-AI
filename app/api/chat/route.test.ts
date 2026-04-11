import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAssistantChatMessage: vi.fn(),
  createUserChatMessage: vi.fn(),
  getFallbackHomepageReply: vi.fn(),
  jsonChatErrorResponse: vi.fn(),
  jsonChatResponse: vi.fn(),
  resolveChatRouteContext: vi.fn(),
  runJobSeekerAgent: vi.fn(),
  searchEmployerCandidates: vi.fn(),
  searchJobsPanel: vi.fn(),
  summarizeChatAttachmentsForAssistant: vi.fn(),
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

vi.mock("@/packages/homepage-assistant/src/fallback", () => ({
  getFallbackHomepageReply: mocks.getFallbackHomepageReply,
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
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();

  mocks.resolveChatRouteContext.mockResolvedValue({
    actor: { cookieValue: null, ownerId: "user:test" },
    ownerId: "user:test",
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
  mocks.createAssistantChatMessage.mockResolvedValue({
    assistantMessage: {
      attachments: [],
      content: "Fallback jobs reply",
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
  });
  mocks.jsonChatResponse.mockImplementation((payload: unknown, _actor: unknown, init?: ResponseInit) =>
    Response.json(payload, init),
  );
  mocks.jsonChatErrorResponse.mockImplementation(() =>
    Response.json({ error: "unexpected" }, { status: 500 }),
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
});
