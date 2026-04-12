import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  browseLatestJobsPanel: vi.fn(),
  createAssistantChatMessage: vi.fn(),
  createUserChatMessage: vi.fn(),
  jsonChatErrorResponse: vi.fn(),
  jsonChatResponse: vi.fn(),
  resolveChatRouteContext: vi.fn(),
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  browseLatestJobsPanel: mocks.browseLatestJobsPanel,
}));

vi.mock("@/packages/chat-domain/src", () => ({
  createAssistantChatMessage: mocks.createAssistantChatMessage,
  createUserChatMessage: mocks.createUserChatMessage,
}));

vi.mock("../route-helpers", () => ({
  jsonChatErrorResponse: mocks.jsonChatErrorResponse,
  jsonChatResponse: mocks.jsonChatResponse,
  resolveChatRouteContext: mocks.resolveChatRouteContext,
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
  mocks.createUserChatMessage.mockResolvedValue({
    assistantMessage: null,
    conversation: {
      id: "conversation_123",
      messages: [{ content: "Find new jobs for me.", role: "user" }],
      projectId: "project_123",
    },
    userMessage: {
      attachments: [],
      content: "Find new jobs for me.",
      createdAt: "2026-04-11T00:00:00.000Z",
      id: "message_user_123",
      role: "user",
    },
    workspace: null,
  });
  mocks.browseLatestJobsPanel.mockResolvedValue({
    agent: {
      clarificationQuestion: null,
      intent: "job_search",
      intentConfidence: 1,
      loopCount: 0,
      maxLoops: 0,
      resultQuality: "acceptable",
      selectedTool: "browseLatestJobs",
      terminationReason: "latest_jobs_browse_completed",
    },
    assistantMessage: "Here are the newest live jobs across all connected sources.",
    debugTrace: [],
    diagnostics: {
      duplicateCount: 0,
      filteredOutCount: 0,
      invalidCount: 0,
      searchLatencyMs: 24,
      sourceCount: 4,
      staleCount: 0,
    },
    generatedAt: "2026-04-11T00:00:00.000Z",
    jobs: [],
    panelCount: 0,
    profileContext: null,
    query: {
      careerIdSignals: [],
      conversationContext: null,
      effectivePrompt: "Find new jobs for me.",
      filters: {
        companies: [],
        employmentType: null,
        exclusions: [],
        industries: [],
        keywords: [],
        location: null,
        locations: [],
        postedWithinDays: null,
        role: null,
        roleFamilies: [],
        rankingBoosts: ["freshness", "trusted_source"],
        remotePreference: null,
        salaryMax: null,
        salaryMin: null,
        seniority: null,
        skills: [],
        targetJobId: null,
        workplaceType: null,
      },
      normalizedPrompt: "find new jobs for me",
      prompt: "Find new jobs for me.",
      usedCareerIdDefaults: false,
    },
    rail: {
      cards: [],
      emptyState: "I couldn’t find any live jobs across the connected sources right now.",
    },
    totalMatches: 0,
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
});

describe("POST /api/chat/latest-jobs", () => {
  it("creates chat messages and uses the dedicated latest-jobs panel flow", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/chat/latest-jobs", {
        body: JSON.stringify({
          clientRequestId: "request_123",
          conversationId: null,
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
    expect(mocks.createUserChatMessage).toHaveBeenCalledTimes(1);
    expect(mocks.browseLatestJobsPanel).toHaveBeenCalledTimes(1);
    expect(mocks.browseLatestJobsPanel).toHaveBeenCalledWith({
      conversationId: "conversation_123",
      limit: undefined,
      ownerId: "user:test",
      refresh: true,
    });
    expect(payload.jobsPanel.agent.selectedTool).toBe("browseLatestJobs");
    expect(payload.assistantMessage.content).toBe(
      "Here are the newest live jobs across all connected sources.",
    );
  });
});
