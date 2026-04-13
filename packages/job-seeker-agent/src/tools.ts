import { zodTextFormat } from "openai/helpers/zod";
import { buildOpenAIResponseMetrics } from "@/lib/braintrust-metrics";
import { getOpenAIClient as getSharedOpenAIClient } from "@/lib/braintrust";
import { traceSpan } from "@/lib/tracing";
import {
  browseLatestJobsCatalog,
  findSimilarJobsCatalog,
  getJobPostingDetails,
  resolveJobSeekerProfileContext,
  searchJobsCatalog,
} from "@/packages/jobs-domain/src";
import {
  buildSearchWebQueryUsed,
  jobSeekerToolRegistry,
  searchWebResultSchema,
  searchWebToolInputSchema,
  searchWebToolOutputSchema,
} from "./tool-registry";
import type { JobSeekerToolSet } from "./types";
import { z } from "zod";

const searchWebParseSchema = z.object({
  results: z.array(searchWebResultSchema),
});

function readOpenAIApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Live web search is unavailable because OPENAI_API_KEY is missing.");
  }

  return apiKey;
}

function getSearchOpenAIClient() {
  return getSharedOpenAIClient(readOpenAIApiKey());
}

function getSearchModelName() {
  return (
    process.env.JOB_SEEKER_AGENT_WEB_SEARCH_MODEL?.trim() ||
    process.env.JOB_SEEKER_AGENT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-5"
  );
}

function buildSearchWebPrompt(input: z.input<typeof searchWebToolInputSchema>) {
  const parsed = searchWebToolInputSchema.parse(input);
  const freshnessInstruction =
    parsed.freshness === "any"
      ? "Use the best available public sources."
      : `Prioritize public sources from the last ${parsed.freshness}.`;
  const domainInstruction =
    parsed.domains?.length && parsed.domains.length > 0
      ? `Prioritize these domains when relevant: ${parsed.domains.join(", ")}.`
      : "Prefer primary reporting, reputable industry analysis, and trustworthy labor-market sources.";

  return [
    `User query: ${parsed.query}`,
    freshnessInstruction,
    domainInstruction,
    `Return up to ${parsed.top_k} distinct results.`,
    "This tool is for public web search only. Do not use internal platform data and do not include weather-related results.",
  ].join("\n");
}

function getSearchContextSize(topK: number) {
  if (topK >= 8) {
    return "high" as const;
  }

  return "medium" as const;
}

export function createLiveJobSeekerToolSet(): JobSeekerToolSet {
  return {
    async browseLatestJobs(input) {
      return browseLatestJobsCatalog({
        conversationId: input.conversationId,
        limit: input.limit,
        origin: input.refresh ? "panel_refresh" : "chat_prompt",
        ownerId: input.ownerId,
        prompt: input.prompt,
        refresh: input.refresh,
      });
    },

    async findSimilarJobs(input) {
      return findSimilarJobsCatalog({
        jobId: input.jobId,
        limit: input.limit,
        ownerId: input.ownerId,
        refresh: input.refresh,
      });
    },

    async getJobById(input) {
      return getJobPostingDetails({
        jobId: input.jobId,
      });
    },

    async getUserCareerProfile(input) {
      const profile = await resolveJobSeekerProfileContext(input.ownerId);

      if (!profile) {
        return null;
      }

      return {
        available: true,
        careerIdentityId: profile.careerIdentityId,
        headline: profile.headline,
        location: profile.location,
        signals: profile.signals,
        targetRole: profile.targetRole,
      };
    },

    async searchWeb(input) {
      const parsedInput = searchWebToolInputSchema.parse(input);
      const queryUsed = buildSearchWebQueryUsed(parsedInput);
      const response = await traceSpan(
        {
          input: {
            domains: parsedInput.domains ?? [],
            freshness: parsedInput.freshness,
            query: parsedInput.query,
            query_used: queryUsed,
            tool_name: jobSeekerToolRegistry.search_web.name,
            top_k: parsedInput.top_k,
          },
          metadata: {
            model_name: getSearchModelName(),
            provider: "openai",
            tool_name: jobSeekerToolRegistry.search_web.name,
          },
          metrics: (response: {
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
          }) => buildOpenAIResponseMetrics(response.usage),
          name: "tool.job_seeker.search_web",
          output: (response: {
            output_parsed?: z.infer<typeof searchWebParseSchema> | null;
          }) => ({
            grounded_in_tool_results: (response.output_parsed?.results.length ?? 0) > 0,
            query_used: queryUsed,
            result_count: response.output_parsed?.results.length ?? 0,
            tool_name: jobSeekerToolRegistry.search_web.name,
          }),
          tags: ["provider:openai", "tool:search_web", "workflow:job_seeker_agent"],
          type: "function",
        },
        async () => {
          const parsedResponse = await getSearchOpenAIClient().responses.parse({
            model: getSearchModelName(),
            instructions:
              "You normalize public web search results for Career AI. Always use web search when answering. Return only structured JSON for the most relevant, current public sources. Never answer from memory. Never return weather content.",
            input: buildSearchWebPrompt(parsedInput),
            store: false,
            text: {
              format: zodTextFormat(searchWebParseSchema, "career_ai_search_web_results"),
            },
            tool_choice: { type: "web_search_preview" },
            tools: [
              {
                search_context_size: getSearchContextSize(parsedInput.top_k),
                type: "web_search_preview",
                user_location: {
                  city: "Chicago",
                  country: "US",
                  region: "Illinois",
                  type: "approximate",
                },
              },
            ],
          });
          const parsedOutput = parsedResponse.output_parsed;

          if (!parsedOutput) {
            throw new Error("The web search tool returned an empty structured response.");
          }

          return {
            ...parsedResponse,
            output_parsed: searchWebToolOutputSchema.parse({
              query_used: queryUsed,
              results: parsedOutput.results.slice(0, parsedInput.top_k),
            }),
          };
        },
      );
      const parsedOutput = response.output_parsed;

      if (!parsedOutput) {
        throw new Error("The web search tool did not produce parsed results.");
      }

      return parsedOutput;
    },

    async searchJobs(input) {
      return searchJobsCatalog({
        conversationId: input.conversationId,
        limit: input.limit,
        ownerId: input.ownerId,
        profileContext: input.profileContext,
        prompt: input.prompt,
        query: input.query,
        refresh: input.refresh,
      });
    },
  };
}

export { jobSeekerToolRegistry };
