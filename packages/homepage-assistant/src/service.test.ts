import { beforeEach, describe, expect, it, vi } from "vitest";

const { createResponseMock, createTranscriptionMock, openAIConstructorMock } = vi.hoisted(() => ({
  createResponseMock: vi.fn(),
  createTranscriptionMock: vi.fn(),
  openAIConstructorMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation((config: { apiKey: string }) => {
    openAIConstructorMock(config);

    return {
      audio: {
        transcriptions: {
          create: createTranscriptionMock,
        },
      },
      responses: {
        create: createResponseMock,
      },
    };
  }),
}));

import {
  generateHomepageAssistantReply,
  getFallbackHomepageReply,
  OpenAIConfigError,
  OpenAIResponseError,
  transcribeHomepageAssistantAudio,
} from "@/packages/homepage-assistant/src";

describe("homepage assistant service", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    createResponseMock.mockReset();
    createTranscriptionMock.mockReset();
    openAIConstructorMock.mockReset();
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.OPENAI_MODEL;
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalModel;
    }
  });

  it("uses the OpenAI SDK with the configured key and default model", async () => {
    createResponseMock.mockResolvedValue({ output_text: "  Verification summary  " });

    await expect(generateHomepageAssistantReply("Summarize the product"))
      .resolves.toBe("Verification summary");

    expect(openAIConstructorMock).toHaveBeenCalledWith({
      apiKey: "test-openai-key",
    });
    expect(createResponseMock).toHaveBeenCalledWith({
      model: "gpt-5",
      instructions: expect.stringContaining("Career AI"),
      input: "Summarize the product",
      store: false,
    });
  });

  it("includes attachment metadata in the assistant input when files are attached", async () => {
    createResponseMock.mockResolvedValue({ output_text: "  Attachment-aware reply  " });

    await expect(
      generateHomepageAssistantReply("Review these uploads", [
        {
          mimeType: "application/pdf",
          name: "offer-letter.pdf",
          size: 512000,
        },
        {
          mimeType: "text/csv",
          name: "scorecard.csv",
          size: 2048,
        },
      ]),
    ).resolves.toBe("Attachment-aware reply");

    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("offer-letter.pdf"),
      }),
    );
    expect(createResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("scorecard.csv"),
      }),
    );
  });

  it("returns a deterministic fallback reply when the OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateHomepageAssistantReply("How is this different from a resume builder?"),
    ).resolves.toContain("Career AI helps you prove it");
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });

  it("falls back when the SDK returns an empty reply", async () => {
    createResponseMock.mockResolvedValue({ output_text: "   " });

    await expect(generateHomepageAssistantReply("Hello")).resolves.toBe(
      getFallbackHomepageReply("Hello"),
    );
  });

  it("falls back when the SDK request throws", async () => {
    createResponseMock.mockRejectedValue(new Error("upstream exploded"));
    const consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      generateHomepageAssistantReply("How is this different from a resume builder?"),
    ).resolves.toBe(getFallbackHomepageReply("How is this different from a resume builder?"));

    consoleErrorMock.mockRestore();
  });

  it("mentions attached files in the fallback response", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateHomepageAssistantReply("How is this different from a resume builder?", [
        {
          mimeType: "application/pdf",
          name: "offer-letter.pdf",
          size: 512000,
        },
      ]),
    ).resolves.toContain("offer-letter.pdf");
  });

  it("transcribes uploaded audio with the default transcription model", async () => {
    const file = new File(["voice"], "voice-note.webm", { type: "audio/webm" });
    createTranscriptionMock.mockResolvedValue({ text: "  spoken summary  " });

    await expect(transcribeHomepageAssistantAudio(file)).resolves.toBe("spoken summary");

    expect(createTranscriptionMock).toHaveBeenCalledWith({
      file,
      model: "gpt-4o-mini-transcribe",
    });
  });

  it("throws a response error when the transcription is empty", async () => {
    const file = new File(["voice"], "voice-note.webm", { type: "audio/webm" });
    createTranscriptionMock.mockResolvedValue({ text: "   " });

    await expect(transcribeHomepageAssistantAudio(file)).rejects.toBeInstanceOf(
      OpenAIResponseError,
    );
  });

  it("still requires an OpenAI key for transcription", async () => {
    const file = new File(["voice"], "voice-note.webm", { type: "audio/webm" });
    delete process.env.OPENAI_API_KEY;

    await expect(transcribeHomepageAssistantAudio(file)).rejects.toBeInstanceOf(
      OpenAIConfigError,
    );
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });
});
