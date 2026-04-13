import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { traceSpanMock } = vi.hoisted(() => ({
  traceSpanMock: vi.fn(),
}));

vi.mock("@/lib/tracing", () => ({
  traceSpan: traceSpanMock,
}));

import { runBoundedAgentOrchestration } from "./orchestrator";

describe("runBoundedAgentOrchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    traceSpanMock.mockImplementation(
      (_options: unknown, callback: (span: unknown) => Promise<unknown> | unknown) =>
        callback({}),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("completes when the first model step returns final text", async () => {
    const executeModel = vi.fn().mockResolvedValue({
      outputText: "Final answer",
      responseId: "resp_1",
      toolCall: null,
    });

    const result = await runBoundedAgentOrchestration({
      buildToolResultInput: () => "unused",
      executeModel,
      executeTool: vi.fn(),
      initialInput: "hello",
    });

    expect(result).toEqual({
      lastResponseId: "resp_1",
      lastToolCall: null,
      outputText: "Final answer",
      stepsUsed: 1,
      stopReason: "completed",
      toolCallsUsed: 0,
    });
  });

  it("continues across multiple tool-backed steps", async () => {
    const executeModel = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: null,
        responseId: "resp_1",
        toolCall: {
          arguments: "{\"query\":\"jobs\"}",
          callId: "call_1",
          name: "search_jobs",
          sideEffect: "read",
        },
      })
      .mockResolvedValueOnce({
        outputText: null,
        responseId: "resp_2",
        toolCall: {
          arguments: "{\"lookup\":\"TAL-123\"}",
          callId: "call_2",
          name: "get_career_id_summary",
          sideEffect: "read",
        },
      })
      .mockResolvedValueOnce({
        outputText: "Here is the combined answer.",
        responseId: "resp_3",
        toolCall: null,
      });
    const executeTool = vi
      .fn()
      .mockResolvedValueOnce({ jobs: [] })
      .mockResolvedValueOnce({ found: true, summary: { candidateId: "tal_123" } });

    const result = await runBoundedAgentOrchestration({
      buildToolResultInput: ({ toolCall, toolOutput }) =>
        `${toolCall.name}:${JSON.stringify(toolOutput)}`,
      executeModel,
      executeTool,
      initialInput: "initial",
    });

    expect(result.stopReason).toBe("completed");
    expect(result.outputText).toBe("Here is the combined answer.");
    expect(result.stepsUsed).toBe(3);
    expect(result.toolCallsUsed).toBe(2);
    expect(executeTool).toHaveBeenCalledTimes(2);
  });

  it("stops when the max tool-call budget is reached", async () => {
    const executeModel = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: null,
        responseId: "resp_1",
        toolCall: {
          arguments: "{}",
          callId: "call_1",
          name: "search_jobs",
          sideEffect: "read",
        },
      })
      .mockResolvedValueOnce({
        outputText: null,
        responseId: "resp_2",
        toolCall: {
          arguments: "{}",
          callId: "call_2",
          name: "get_career_id_summary",
          sideEffect: "read",
        },
      });
    const executeTool = vi.fn().mockResolvedValue({ ok: true });

    const result = await runBoundedAgentOrchestration({
      buildToolResultInput: ({ toolCall }) => toolCall.name,
      config: {
        maxToolCalls: 1,
      },
      executeModel,
      executeTool,
      initialInput: "initial",
    });

    expect(result.stopReason).toBe("max_tool_calls_reached");
    expect(result.stepsUsed).toBe(2);
    expect(result.toolCallsUsed).toBe(1);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it("retries a transient model failure once before succeeding", async () => {
    const executeModel = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary upstream failure"))
      .mockResolvedValueOnce({
        outputText: "Recovered answer",
        responseId: "resp_1",
        toolCall: null,
      });

    const result = await runBoundedAgentOrchestration({
      buildToolResultInput: () => "unused",
      config: {
        maxModelRetries: 1,
      },
      executeModel,
      executeTool: vi.fn(),
      initialInput: "initial",
    });

    expect(result.stopReason).toBe("completed");
    expect(result.outputText).toBe("Recovered answer");
    expect(executeModel).toHaveBeenCalledTimes(2);
  });

  it("does not retry after a mutating tool has already executed", async () => {
    const executeModel = vi
      .fn()
      .mockResolvedValueOnce({
        outputText: null,
        responseId: "resp_1",
        toolCall: {
          arguments: "{}",
          callId: "call_1",
          name: "create_access_request",
          sideEffect: "mutating",
        },
      })
      .mockRejectedValueOnce(new Error("follow-up model failure"));

    const result = await runBoundedAgentOrchestration({
      buildToolResultInput: () => "tool-output",
      config: {
        maxModelRetries: 2,
      },
      executeModel,
      executeTool: vi.fn().mockResolvedValue({ ok: true }),
      initialInput: "initial",
    });

    expect(result.stopReason).toBe("model_error");
    expect(executeModel).toHaveBeenCalledTimes(2);
  });

  it("returns a step timeout when the model step exceeds the per-step budget", async () => {
    const result = await runBoundedAgentOrchestration({
      buildToolResultInput: () => "unused",
      config: {
        maxModelRetries: 0,
        perStepTimeoutMs: 20,
      },
      executeModel: () => new Promise(() => {}),
      executeTool: vi.fn(),
      initialInput: "initial",
    });

    expect(result).toMatchObject({
      stopReason: "step_timeout",
      stepsUsed: 0,
      toolCallsUsed: 0,
    });
  });

  it("returns overall timeout before the next step when the total budget is exhausted", async () => {
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(0);

    const result = await runBoundedAgentOrchestration({
      buildToolResultInput: () => "tool-output",
      config: {
        overallTimeoutMs: 100,
      },
      executeModel: vi
        .fn()
        .mockResolvedValueOnce({
          outputText: null,
          responseId: "resp_1",
          toolCall: {
            arguments: "{}",
            callId: "call_1",
            name: "search_jobs",
            sideEffect: "read",
          },
        }),
      executeTool: vi.fn().mockImplementation(async () => {
        nowSpy.mockReturnValue(400);
        return { ok: true };
      }),
      initialInput: "initial",
    });

    expect(result.stopReason).toBe("overall_timeout");
    expect(result.stepsUsed).toBe(1);
    expect(result.toolCallsUsed).toBe(1);
  });
});
