import { traceSpan } from "@/lib/tracing";
import type { InternalAgentStopReason } from "@/packages/contracts/src";

export type AgentToolSideEffect = "mutating" | "read";

export type AgentOrchestrationToolCall = {
  arguments: string;
  callId?: string | null;
  name: string;
  sideEffect?: AgentToolSideEffect;
};

export type AgentOrchestrationStepResult = {
  outputText: string | null;
  responseId: string | null;
  toolCall: AgentOrchestrationToolCall | null;
};

export type AgentOrchestrationConfig = {
  maxModelRetries: number;
  maxSteps: number;
  maxToolCalls: number;
  overallTimeoutMs: number;
  perStepTimeoutMs: number;
};

export type AgentOrchestrationResult = {
  outputText: string | null;
  lastResponseId: string | null;
  lastToolCall: AgentOrchestrationToolCall | null;
  stepsUsed: number;
  stopReason: InternalAgentStopReason;
  toolCallsUsed: number;
};

type AgentOrchestrationTimeoutKind = "overall_timeout" | "step_timeout";

type RunBoundedAgentOrchestrationArgs<TInput, TToolOutput> = {
  buildToolResultInput: (args: {
    toolCall: AgentOrchestrationToolCall;
    toolOutput: TToolOutput;
  }) => TInput;
  config?: Partial<AgentOrchestrationConfig>;
  executeModel: (args: {
    input: TInput;
    previousResponseId: string | null;
    stepNumber: number;
  }) => Promise<AgentOrchestrationStepResult>;
  executeTool: (toolCall: AgentOrchestrationToolCall) => Promise<TToolOutput>;
  initialInput: TInput;
  metadata?: Record<string, unknown>;
  traceName?: string;
};

const defaultAgentOrchestrationConfig: AgentOrchestrationConfig = {
  maxModelRetries: 1,
  maxSteps: 4,
  maxToolCalls: 3,
  overallTimeoutMs: 20_000,
  perStepTimeoutMs: 8_000,
};

class AgentOrchestrationTimeoutError extends Error {
  constructor(public readonly kind: AgentOrchestrationTimeoutKind) {
    super(
      kind === "overall_timeout"
        ? "The orchestration exceeded the total timeout."
        : "The orchestration step timed out.",
    );
    this.name = "AgentOrchestrationTimeoutError";
  }
}

function normalizeConfig(
  config?: Partial<AgentOrchestrationConfig>,
): AgentOrchestrationConfig {
  return {
    maxModelRetries: Math.max(
      0,
      config?.maxModelRetries ?? defaultAgentOrchestrationConfig.maxModelRetries,
    ),
    maxSteps: Math.max(1, config?.maxSteps ?? defaultAgentOrchestrationConfig.maxSteps),
    maxToolCalls: Math.max(
      0,
      config?.maxToolCalls ?? defaultAgentOrchestrationConfig.maxToolCalls,
    ),
    overallTimeoutMs: Math.max(
      250,
      config?.overallTimeoutMs ?? defaultAgentOrchestrationConfig.overallTimeoutMs,
    ),
    perStepTimeoutMs: Math.max(
      100,
      config?.perStepTimeoutMs ?? defaultAgentOrchestrationConfig.perStepTimeoutMs,
    ),
  };
}

function getRemainingOverallTime(deadlineMs: number) {
  return deadlineMs - Date.now();
}

function createTimeoutPromise(timeoutMs: number, kind: AgentOrchestrationTimeoutKind) {
  return new Promise<never>((_, reject) => {
    const timeout = setTimeout(() => {
      reject(new AgentOrchestrationTimeoutError(kind));
    }, timeoutMs);

    timeout.unref?.();
  });
}

async function withTimeout<TResult>(args: {
  kind: AgentOrchestrationTimeoutKind;
  timeoutMs: number;
  work: () => Promise<TResult>;
}) {
  return Promise.race([args.work(), createTimeoutPromise(args.timeoutMs, args.kind)]);
}

function getTimeoutStopReason(error: unknown): AgentOrchestrationTimeoutKind | null {
  if (error instanceof AgentOrchestrationTimeoutError) {
    return error.kind;
  }

  return null;
}

function shouldRetryModelCall(args: {
  attemptNumber: number;
  config: AgentOrchestrationConfig;
  mutatingToolExecuted: boolean;
}) {
  if (args.mutatingToolExecuted) {
    return false;
  }

  return args.attemptNumber < args.config.maxModelRetries;
}

export async function runBoundedAgentOrchestration<TInput, TToolOutput>(
  args: RunBoundedAgentOrchestrationArgs<TInput, TToolOutput>,
): Promise<AgentOrchestrationResult> {
  const config = normalizeConfig(args.config);
  const traceName = args.traceName ?? "workflow.agent.orchestration.loop";
  const deadlineMs = Date.now() + config.overallTimeoutMs;

  return traceSpan(
    {
      input: {
        max_model_retries: config.maxModelRetries,
        max_steps: config.maxSteps,
        max_tool_calls: config.maxToolCalls,
        overall_timeout_ms: config.overallTimeoutMs,
        per_step_timeout_ms: config.perStepTimeoutMs,
      },
      metadata: args.metadata,
      name: traceName,
      output: (result: AgentOrchestrationResult) => ({
        last_response_id: result.lastResponseId,
        last_tool_name: result.lastToolCall?.name ?? null,
        output_length: result.outputText?.length ?? 0,
        steps_used: result.stepsUsed,
        stop_reason: result.stopReason,
        tool_calls_used: result.toolCallsUsed,
      }),
      tags: ["workflow:agent_orchestration"],
      type: "task",
    },
    async () => {
      let currentInput = args.initialInput;
      let previousResponseId: string | null = null;
      let stepsUsed = 0;
      let toolCallsUsed = 0;
      let lastToolCall: AgentOrchestrationToolCall | null = null;
      let mutatingToolExecuted = false;

      while (stepsUsed < config.maxSteps) {
        const remainingOverallTime = getRemainingOverallTime(deadlineMs);

        if (remainingOverallTime <= 0) {
          return {
            lastResponseId: previousResponseId,
            lastToolCall,
            outputText: null,
            stepsUsed,
            stopReason: "overall_timeout",
            toolCallsUsed,
          };
        }

        let stepResult: AgentOrchestrationStepResult | null = null;
        let attemptNumber = 0;

        while (stepResult === null) {
          try {
            stepResult = await traceSpan(
              {
                input: {
                  attempt_number: attemptNumber,
                  previous_response_id: previousResponseId,
                  step_number: stepsUsed + 1,
                },
                metadata: args.metadata,
                name: "workflow.agent.orchestration.step",
                output: (result: AgentOrchestrationStepResult) => ({
                  has_output_text: Boolean(result.outputText?.trim()),
                  response_id: result.responseId,
                  tool_name: result.toolCall?.name ?? null,
                }),
                tags: ["workflow:agent_orchestration"],
                type: "task",
              },
              async () =>
                withTimeout({
                  kind: "step_timeout",
                  timeoutMs: Math.min(config.perStepTimeoutMs, remainingOverallTime),
                  work: () =>
                    args.executeModel({
                      input: currentInput,
                      previousResponseId,
                      stepNumber: stepsUsed + 1,
                    }),
                }),
            );
          } catch (error) {
            const timeoutStopReason = getTimeoutStopReason(error);

            if (timeoutStopReason) {
              if (
                timeoutStopReason === "step_timeout" &&
                shouldRetryModelCall({
                  attemptNumber,
                  config,
                  mutatingToolExecuted,
                })
              ) {
                attemptNumber += 1;
                continue;
              }

              return {
                lastResponseId: previousResponseId,
                lastToolCall,
                outputText: null,
                stepsUsed,
                stopReason: timeoutStopReason,
                toolCallsUsed,
              };
            }

            if (
              shouldRetryModelCall({
                attemptNumber,
                config,
                mutatingToolExecuted,
              })
            ) {
              attemptNumber += 1;
              continue;
            }

            return {
              lastResponseId: previousResponseId,
              lastToolCall,
              outputText: null,
              stepsUsed,
              stopReason: "model_error",
              toolCallsUsed,
            };
          }
        }

        stepsUsed += 1;
        previousResponseId = stepResult.responseId ?? previousResponseId;

        if (stepResult.toolCall) {
          if (toolCallsUsed >= config.maxToolCalls) {
            return {
              lastResponseId: previousResponseId,
              lastToolCall: stepResult.toolCall,
              outputText: null,
              stepsUsed,
              stopReason: "max_tool_calls_reached",
              toolCallsUsed,
            };
          }

          const remainingToolTime = getRemainingOverallTime(deadlineMs);

          if (remainingToolTime <= 0) {
            return {
              lastResponseId: previousResponseId,
              lastToolCall: stepResult.toolCall,
              outputText: null,
              stepsUsed,
              stopReason: "overall_timeout",
              toolCallsUsed,
            };
          }

          try {
            const toolOutput = await withTimeout({
              kind: "step_timeout",
              timeoutMs: Math.min(config.perStepTimeoutMs, remainingToolTime),
              work: () => args.executeTool(stepResult.toolCall!),
            });

            toolCallsUsed += 1;
            lastToolCall = stepResult.toolCall;
            mutatingToolExecuted =
              mutatingToolExecuted || stepResult.toolCall.sideEffect === "mutating";
            currentInput = args.buildToolResultInput({
              toolCall: stepResult.toolCall,
              toolOutput,
            });

            continue;
          } catch (error) {
            const timeoutStopReason = getTimeoutStopReason(error);

            return {
              lastResponseId: previousResponseId,
              lastToolCall: stepResult.toolCall,
              outputText: null,
              stepsUsed,
              stopReason: timeoutStopReason ?? "tool_error",
              toolCallsUsed,
            };
          }
        }

        const outputText = stepResult.outputText?.trim() ?? null;

        if (outputText) {
          return {
            lastResponseId: previousResponseId,
            lastToolCall,
            outputText,
            stepsUsed,
            stopReason: "completed",
            toolCallsUsed,
          };
        }

        return {
          lastResponseId: previousResponseId,
          lastToolCall,
          outputText: null,
          stepsUsed,
          stopReason: "empty_response",
          toolCallsUsed,
        };
      }

      return {
        lastResponseId: previousResponseId,
        lastToolCall,
        outputText: null,
        stepsUsed,
        stopReason: "max_steps_reached",
        toolCallsUsed,
      };
    },
  );
}
