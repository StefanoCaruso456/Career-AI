import { getOpenAIClient as getSharedOpenAIClient } from "@/lib/braintrust";
import { buildOpenAIResponseMetrics } from "@/lib/braintrust-metrics";
import { traceSpan } from "@/lib/tracing";
import { getFallbackHomepageReply, getMatchedHomepageReply } from "./fallback";

const homepageInstructions =
  "You are the homepage assistant for Career AI. Reply with concise, high-signal answers focused on hiring verification, candidate identity, recruiter trust, and product workflows. When users ask what the agent does, explain that it turns their Career ID into a recruiter-ready trust layer by referencing identity, work history, education, and supporting proof so HR teams and recruiters can understand the candidate, ask better questions, and trust what they see faster. Keep answers clear and direct.";

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
) {
  const result = await traceSpan<HomepageAssistantReplyResult>(
    {
      input: {
        attachment_count: attachments.length,
        message,
        model: getModel(),
      },
      metadata: {
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
        const response = await traceSpan(
          {
            input: {
              attachment_count: attachments.length,
              input: buildAssistantInput(message, attachments),
              instructions: homepageInstructions,
              model: getModel(),
            },
            metadata: {
              model_name: getModel(),
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
              model: getModel(),
              instructions: homepageInstructions,
              input: buildAssistantInput(message, attachments),
              store: false,
            });

            endedAtMs = Date.now();
            return openAIResponse;
          },
        );

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
