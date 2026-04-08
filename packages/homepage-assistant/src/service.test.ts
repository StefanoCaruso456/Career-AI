import { beforeEach, describe, expect, it, vi } from "vitest";

const { createResponseMock, openAIConstructorMock } = vi.hoisted(() => ({
  createResponseMock: vi.fn(),
  openAIConstructorMock: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation((config: { apiKey: string }) => {
    openAIConstructorMock(config);

    return {
      responses: {
        create: createResponseMock,
      },
    };
  }),
}));

import {
  OpenAIConfigError,
  OpenAIResponseError,
  generateHomepageAssistantReply,
} from "@/packages/homepage-assistant/src";

describe("homepage assistant service", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    createResponseMock.mockReset();
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

  it("throws a config error when the OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(generateHomepageAssistantReply("Hello")).rejects.toBeInstanceOf(
      OpenAIConfigError,
    );
    expect(openAIConstructorMock).not.toHaveBeenCalled();
  });

  it("throws a response error when the SDK returns an empty reply", async () => {
    createResponseMock.mockResolvedValue({ output_text: "   " });

    await expect(generateHomepageAssistantReply("Hello")).rejects.toBeInstanceOf(
      OpenAIResponseError,
    );
  });
});
