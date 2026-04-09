import OpenAI from "openai";

const homepageInstructions =
  "You are the homepage assistant for Career AI. Reply with concise, high-signal answers focused on hiring verification, candidate identity, recruiter trust, and product workflows. Keep answers clear and direct.";

const homepageFallbackReplies = [
  {
    matches: ["what does the agent actually do", "what does the agent do"],
    output:
      "Career AI verifies identity, work history, and supporting signals so employers can review a candidate with more trust. Instead of relying on a static resume alone, it builds a portable credibility profile with evidence, audit history, and recruiter-facing verification context.",
  },
  {
    matches: ["resume builder", "different from a resume"],
    output:
      "A resume builder helps you format a story. Career AI helps you prove it. The platform is designed to attach verified identity, employment, and trust signals to the candidate so employers can move faster with more confidence.",
  },
  {
    matches: [
      "get hired faster",
      "why should i do this",
      "why do this",
      "why does this matter",
    ],
    output:
      "It helps you get hired faster by reducing recruiter doubt. When employers can see verified identity, supporting evidence, and a clear audit trail, they spend less time second-guessing claims and more time moving qualified candidates forward.",
  },
];

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

function getFallbackHomepageReply(message: string) {
  const normalizedMessage = message.trim().toLowerCase();
  const matchedFallback = homepageFallbackReplies.find(({ matches }) =>
    matches.some((match) => normalizedMessage.includes(match)),
  );

  if (matchedFallback) {
    return matchedFallback.output;
  }

  return "Career AI is a verified career identity platform for job seekers. It helps candidates turn claims into evidence-backed credibility so employers can trust them faster and make hiring decisions with less uncertainty.";
}

export async function generateHomepageAssistantReply(message: string) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return getFallbackHomepageReply(message);
  }

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
