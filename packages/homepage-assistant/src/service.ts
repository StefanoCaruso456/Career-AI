import { getOpenAIClient as getSharedOpenAIClient } from "@/lib/braintrust";
import { buildOpenAIResponseMetrics } from "@/lib/braintrust-metrics";
import { traceSpan } from "@/lib/tracing";
import {
  buildAgentModelContext,
  type AgentContext,
  type AgentConversationMessage,
} from "@/packages/agent-runtime/src";
import {
  AgentToolInputError,
  AgentToolPermissionError,
  executeAgentToolCall,
  homepageAssistantToolRegistry,
  listAgentToolsAsOpenAIFunctions,
} from "@/packages/agent-runtime/src/tools";
import { getFallbackHomepageReply, getMatchedHomepageReply } from "./fallback";

const homepageInstructions =
  "You are the homepage assistant for Career AI. Reply with concise, high-signal answers focused on hiring verification, candidate identity, recruiter trust, and product workflows. When users ask what the agent does, explain that it turns their Career ID into a recruiter-ready trust layer by referencing identity, work history, education, and supporting proof so HR teams and recruiters can understand the candidate, ask better questions, and trust what they see faster. Use available tools for live jobs, Career ID summaries, and public/shared candidate lookups instead of guessing. Keep answers clear and direct.";

export type HomepageAssistantAttachment = {
  mimeType: string;
  name: string;
  size: number;
};

export class OpenAIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIConfigError";
  }
}

export class OpenAIResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIResponseError";
  }
}

function getHomepageOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIConfigError("The server is missing OPENAI_API_KEY.");
  }

  return getSharedOpenAIClient(apiKey);
}

function getModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5";
}

function getTranscriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe";
}

function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function buildAssistantInput(message: string, attachments: HomepageAssistantAttachment[]) {
  if (attachments.length === 0) {
    return message;
  }

  const normalizedMessage = message.trim();
  const attachmentSummary = attachments
    .map(
      (attachment) =>
        `- ${attachment.name} (${attachment.mimeType || "application/octet-stream"}, ${formatAttachmentSize(attachment.size)})`,
    )
    .join("\n");

  return [
    normalizedMessage || "The user attached supporting files and wants help with them.",
    "",
    "Attached files:",
    attachmentSummary,
    "",
    "You can acknowledge attached files by name and type, but do not claim to have parsed their contents unless the user provided those contents in text.",
  ].join("\n");
}

function buildHomepageModelInput(args: {
  agentContext?: AgentContext | null;
  attachments: HomepageAssistantAttachment[];
  message: string;
  messages?: AgentConversationMessage[] | null;
}) {
  const baseInput = buildAssistantInput(args.message, args.attachments);
  const modelContext = buildAgentModelContext({
    agentContext: args.agentContext,
    currentMessage: args.message,
    messages: args.messages,
  });

  if (!modelContext) {
    return baseInput;
  }

  return [modelContext, "", "Current user request:", baseInput].join("\n");
}

function buildReplyPreview(reply: string) {
  return reply.slice(0, 160);
}

function getOpenAIErrorMetadata(error: unknown) {
  if (error instanceof Error) {
    return {
      error_message: error.message,
      error_type: error.name,
    };
  }

  return {
    error_message: String(error),
    error_type: typeof error,
  };
}

function getAgentContextMetadata(agentContext?: AgentContext | null) {
  if (!agentContext) {
    return undefined;
  }

  return {
    actor_kind: agentContext.actor.kind,
    organization_id: agentContext.organizationContext?.primaryOrganization?.organizationId ?? null,
    organization_membership_count: agentContext.organizationContext?.activeMembershipCount ?? 0,
    organization_role: agentContext.organizationContext?.primaryOrganization?.role ?? null,
    preferred_persona: agentContext.preferredPersona,
    role_type: agentContext.roleType,
    run_id: agentContext.run.runId,
  };
}

function extractSingleFunctionToolCall(response: { output?: unknown[] | null }) {
  const toolCalls =
    response.output?.filter(
      (item): item is { arguments: string; call_id: string; name: string; type: "function_call" } =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "function_call" &&
        "arguments" in item &&
        typeof item.arguments === "string" &&
        "call_id" in item &&
        typeof item.call_id === "string" &&
        "name" in item &&
        typeof item.name === "string",
    ) ?? [];

  if (toolCalls.length === 0) {
    return null;
  }

  if (toolCalls.length > 1) {
    throw new OpenAIResponseError(
      "Homepage assistant only supports one function tool call per response.",
    );
  }

  return toolCalls[0];
}

function buildToolOutputInput(args: { callId: string; output: unknown }) {
  return [
    {
      call_id: args.callId,
      output: JSON.stringify(args.output),
      type: "function_call_output" as const,
    },
  ];
}

function buildKnownToolErrorOutput(error: unknown) {
  if (error instanceof AgentToolPermissionError) {
    return {
      error: {
        code: "forbidden",
        message: error.message,
      },
      ok: false,
    };
  }

  if (error instanceof AgentToolInputError) {
    return {
      error: {
        code: "invalid_input",
        message: error.message,
      },
      ok: false,
    };
  }

  return null;
}

async function runHomepageFallback(args: {
  attachments: HomepageAssistantAttachment[];
  error?: unknown;
  message: string;
  reason: "empty_response" | "missing_openai_api_key" | "openai_error";
}) {
  return traceSpan(
    {
      input: {
        attachment_count: args.attachments.length,
        message: args.message,
        reason: args.reason,
      },
      metadata: args.error ? getOpenAIErrorMetadata(args.error) : undefined,
      name: "llm.homepage.fallback",
      output: (reply: string) => ({
        output_preview: buildReplyPreview(reply),
        output_text_length: reply.length,
        reason: args.reason,
      }),
      tags: ["provider:fallback", "workflow:homepage_assistant"],
      type: "function",
    },
    () => getFallbackHomepageReply(args.message, args.attachments),
  );
}

type HomepageAssistantReplyResult = {
  source:
    | "matched_reply"
    | "missing_openai_api_key_fallback"
    | "openai"
    | "openai_empty_fallback"
    | "openai_error_fallback";
  text: string;
};

export async function generateHomepageAssistantReply(
  message: string,
  attachments: HomepageAssistantAttachment[] = [],
  options?: {
    agentContext?: AgentContext | null;
    conversationMessages?: AgentConversationMessage[] | null;
  },
) {
  const result = await traceSpan<HomepageAssistantReplyResult>(
    {
      input: {
        attachment_count: attachments.length,
        conversation_message_count: options?.conversationMessages?.length ?? 0,
        message,
        model: getModel(),
      },
      metadata: {
        ...getAgentContextMetadata(options?.agentContext),
        prompt_version: "homepage_assistant.v1",
        workflow_id: "homepage_assistant.reply",
      },
      name: "workflow.homepage_assistant.reply",
      output: (replyResult: HomepageAssistantReplyResult) => ({
        output_preview: buildReplyPreview(replyResult.text),
        output_text_length: replyResult.text.length,
        source: replyResult.source,
      }),
      tags: ["workflow:homepage_assistant"],
      type: "task",
    },
    async () => {
      const matchedReply = getMatchedHomepageReply(message, attachments);

      if (matchedReply) {
        return {
          source: "matched_reply" as const,
          text: matchedReply,
        };
      }

      if (!process.env.OPENAI_API_KEY?.trim()) {
        return {
          source: "missing_openai_api_key_fallback" as const,
          text: await runHomepageFallback({
            attachments,
            message,
            reason: "missing_openai_api_key",
          }),
        };
      }

      try {
        const startedAtMs = Date.now();
        let endedAtMs = startedAtMs;
        const firstInput = buildHomepageModelInput({
          agentContext: options?.agentContext,
          attachments,
          message,
          messages: options?.conversationMessages,
        });
        const tools = options?.agentContext
          ? listAgentToolsAsOpenAIFunctions(homepageAssistantToolRegistry)
          : [];
        const response = await traceSpan(
          {
            input: {
              attachment_count: attachments.length,
              input: firstInput,
              instructions: homepageInstructions,
              model: getModel(),
              tool_count: tools.length,
            },
            metadata: {
              model_name: getModel(),
              ...getAgentContextMetadata(options?.agentContext),
              prompt_version: "homepage_assistant.v1",
              provider: "openai",
            },
            metrics: (openAIResponse: {
              usage?: {
                input_tokens?: number | null;
                input_tokens_details?: {
                  cached_tokens?: number | null;
                } | null;
                output_tokens?: number | null;
                output_tokens_details?: {
                  reasoning_tokens?: number | null;
                } | null;
                total_tokens?: number | null;
              } | null;
            }) =>
              buildOpenAIResponseMetrics(openAIResponse.usage, {
                endedAtMs,
                startedAtMs,
              }),
            name: "llm.openai.responses.create",
            output: (openAIResponse: {
              output_text?: string | null;
            }) => {
              const output = openAIResponse.output_text?.trim() ?? "";

              return {
                model: getModel(),
                output_preview: buildReplyPreview(output),
                output_text_length: output.length,
                provider: "openai",
              };
            },
            tags: ["provider:openai", "workflow:homepage_assistant"],
            type: "llm",
          },
          async () => {
            const openAIResponse = await getHomepageOpenAIClient().responses.create({
              ...(tools.length > 0 ? { tools } : {}),
              input: firstInput,
              instructions: homepageInstructions,
              model: getModel(),
              store: false,
            });

            endedAtMs = Date.now();
            return openAIResponse;
          },
        );

        const toolCall = extractSingleFunctionToolCall(response);

        if (toolCall && options?.agentContext) {
          let toolOutput: unknown;

          try {
            toolOutput = await executeAgentToolCall({
              agentContext: options.agentContext,
              registry: homepageAssistantToolRegistry,
              toolCall,
            });
          } catch (error) {
            const knownToolErrorOutput = buildKnownToolErrorOutput(error);

            if (!knownToolErrorOutput) {
              throw error;
            }

            toolOutput = knownToolErrorOutput;
          }
          const followUpResponse = await traceSpan(
            {
              input: {
                model: getModel(),
                previous_response_id: response.id,
                tool_name: toolCall.name,
              },
              metadata: {
                model_name: getModel(),
                ...getAgentContextMetadata(options?.agentContext),
                prompt_version: "homepage_assistant.v1",
                provider: "openai",
              },
              metrics: (openAIResponse: {
                usage?: {
                  input_tokens?: number | null;
                  input_tokens_details?: {
                    cached_tokens?: number | null;
                  } | null;
                  output_tokens?: number | null;
                  output_tokens_details?: {
                    reasoning_tokens?: number | null;
                  } | null;
                  total_tokens?: number | null;
                } | null;
              }) =>
                buildOpenAIResponseMetrics(openAIResponse.usage, {
                  endedAtMs,
                  startedAtMs,
                }),
              name: "llm.openai.responses.create.tool_follow_up",
              output: (openAIResponse: {
                output_text?: string | null;
              }) => {
                const output = openAIResponse.output_text?.trim() ?? "";

                return {
                  model: getModel(),
                  output_preview: buildReplyPreview(output),
                  output_text_length: output.length,
                  provider: "openai",
                  tool_name: toolCall.name,
                };
              },
              tags: [
                "provider:openai",
                "workflow:homepage_assistant",
                `tool:${toolCall.name}`,
              ],
              type: "llm",
            },
            async () => {
              const openAIResponse = await getHomepageOpenAIClient().responses.create({
                input: buildToolOutputInput({
                  callId: toolCall.call_id,
                  output: toolOutput,
                }),
                instructions: homepageInstructions,
                model: getModel(),
                previous_response_id: response.id,
                store: false,
              });

              endedAtMs = Date.now();
              return openAIResponse;
            },
          );
          const followUpOutput = followUpResponse.output_text?.trim();

          if (!followUpOutput) {
            return {
              source: "openai_empty_fallback" as const,
              text: await runHomepageFallback({
                attachments,
                message,
                reason: "empty_response",
              }),
            };
          }

          return {
            source: "openai" as const,
            text: followUpOutput,
          };
        }

        const output = response.output_text?.trim();

        if (!output) {
          return {
            source: "openai_empty_fallback" as const,
            text: await runHomepageFallback({
              attachments,
              message,
              reason: "empty_response",
            }),
          };
        }

        return {
          source: "openai" as const,
          text: output,
        };
      } catch (error) {
        console.error("Homepage assistant fell back after an OpenAI response failure", error);

        return {
          source: "openai_error_fallback" as const,
          text: await runHomepageFallback({
            attachments,
            error,
            message,
            reason: "openai_error",
          }),
        };
      }
    },
  );

  return result.text;
}

export async function transcribeHomepageAssistantAudio(file: File) {
  const response = await getHomepageOpenAIClient().audio.transcriptions.create({
    file,
    model: getTranscriptionModel(),
  });

  const output = response.text?.trim();

  if (!output) {
    throw new OpenAIResponseError("The transcription came back empty.");
  }

  return output;
}
