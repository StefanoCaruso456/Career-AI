import { describe, expect, it } from "vitest";
import {
  buildLangChainUsageMetrics,
  buildOpenAIResponseMetrics,
} from "./braintrust-metrics";

describe("braintrust metrics helpers", () => {
  it("maps OpenAI responses usage into Braintrust metric fields", () => {
    expect(
      buildOpenAIResponseMetrics(
        {
          input_tokens: 120,
          input_tokens_details: {
            cached_tokens: 30,
          },
          output_tokens: 45,
          output_tokens_details: {
            reasoning_tokens: 12,
          },
          total_tokens: 165,
        },
        {
          endedAtMs: 1500,
          startedAtMs: 1000,
        },
      ),
    ).toEqual({
      completion_reasoning_tokens: 12,
      completion_tokens: 45,
      prompt_cached_tokens: 30,
      prompt_tokens: 120,
      time_to_first_token: 0.5,
      tokens: 165,
    });
  });

  it("maps LangChain usage metadata into Braintrust metric fields", () => {
    expect(
      buildLangChainUsageMetrics(
        {
          usage_metadata: {
            input_token_details: {
              cache_creation: 18,
              cache_read: 25,
            },
            input_tokens: 100,
            output_token_details: {
              reasoning: 9,
            },
            output_tokens: 40,
          },
        },
        {
          endedAtMs: 2400,
          startedAtMs: 1200,
        },
      ),
    ).toEqual({
      completion_reasoning_tokens: 9,
      completion_tokens: 40,
      prompt_cache_creation_tokens: 18,
      prompt_cached_tokens: 25,
      prompt_tokens: 100,
      time_to_first_token: 1.2,
      tokens: 140,
    });
  });
});
