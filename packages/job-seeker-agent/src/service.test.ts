import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createJobSeekerAgentMock,
  createLiveJobSeekerAgentModelMock,
  createLiveJobSeekerToolSetMock,
  invokeMock,
  traceSpanMock,
} = vi.hoisted(() => {
  const invokeMock = vi.fn();

  return {
    createJobSeekerAgentMock: vi.fn(() => ({
      invoke: invokeMock,
    })),
    createLiveJobSeekerAgentModelMock: vi.fn(() => ({ model: "stub" })),
    createLiveJobSeekerToolSetMock: vi.fn(() => ({ tools: "stub" })),
    invokeMock,
    traceSpanMock: vi.fn(),
  };
});

vi.mock("./model", () => ({
  createLiveJobSeekerAgentModel: createLiveJobSeekerAgentModelMock,
}));

vi.mock("./runtime", () => ({
  createJobSeekerAgent: createJobSeekerAgentMock,
}));

vi.mock("./tools", () => ({
  createLiveJobSeekerToolSet: createLiveJobSeekerToolSetMock,
}));

vi.mock("@/lib/tracing", () => ({
  traceSpan: traceSpanMock,
}));

import { runJobSeekerAgent } from "./service";

beforeEach(() => {
  invokeMock.mockReset();
  traceSpanMock.mockReset();
  traceSpanMock.mockImplementation(
    (_options: unknown, callback: () => Promise<unknown> | unknown) => callback(),
  );
});

describe("runJobSeekerAgent", () => {
  it("wraps the runtime invocation in a workflow span", async () => {
    invokeMock.mockResolvedValue({
      assistantMessage: "Found grounded job matches.",
      jobsPanel: {
        assistantMessage: "Found grounded job matches.",
        jobs: [{ id: "job_123" }],
        rail: { cards: [], emptyState: "No jobs." },
      },
    });

    const result = await runJobSeekerAgent({
      attachments: [],
      conversationId: "conversation_123",
      limit: 8,
      messages: [{ content: "Find product jobs", role: "user" }],
      ownerId: "user:test",
      userQuery: "Find product jobs",
    });

    expect(result.assistantMessage).toBe("Found grounded job matches.");
    expect(traceSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "workflow.job_seeker_agent.run",
        tags: ["workflow:job_seeker_agent"],
        type: "task",
      }),
      expect.any(Function),
    );
  });
});
