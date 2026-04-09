import OpenAI from "openai";
import { getFallbackHomepageReply } from "./fallback";

const homepageInstructions =
  "You are the homepage assistant for Career AI. Reply with concise, high-signal answers focused on hiring verification, candidate identity, recruiter trust, and product workflows. Keep answers clear and direct.";

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

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIConfigError("The server is missing OPENAI_API_KEY.");
  }

  return new OpenAI({ apiKey });
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

export async function generateHomepageAssistantReply(
  message: string,
  attachments: HomepageAssistantAttachment[] = [],
) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return getFallbackHomepageReply(message, attachments);
  }

  try {
    const response = await getOpenAIClient().responses.create({
      model: getModel(),
      instructions: homepageInstructions,
      input: buildAssistantInput(message, attachments),
      store: false,
    });

    const output = response.output_text?.trim();

    if (!output) {
      return getFallbackHomepageReply(message, attachments);
    }

    return output;
  } catch (error) {
    console.error("Homepage assistant fell back after an OpenAI response failure", error);
    return getFallbackHomepageReply(message, attachments);
  }
}

export async function transcribeHomepageAssistantAudio(file: File) {
  const response = await getOpenAIClient().audio.transcriptions.create({
    file,
    model: getTranscriptionModel(),
  });

  const output = response.text?.trim();

  if (!output) {
    throw new OpenAIResponseError("The transcription came back empty.");
  }

  return output;
}
