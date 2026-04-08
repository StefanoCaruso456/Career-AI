import OpenAI from "openai";

const homepageInstructions =
  "You are the homepage assistant for Career AI. Reply with concise, high-signal answers focused on hiring verification, candidate identity, recruiter trust, and product workflows. Keep answers clear and direct.";

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

export async function generateHomepageAssistantReply(message: string) {
  const response = await getOpenAIClient().responses.create({
    model: getModel(),
    instructions: homepageInstructions,
    input: message,
    store: false,
  });

  const output = response.output_text?.trim();

  if (!output) {
    throw new OpenAIResponseError("The model returned an empty response.");
  }

  return output;
}
