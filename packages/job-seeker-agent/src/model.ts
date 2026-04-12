import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { buildLangChainUsageMetrics } from "@/lib/braintrust-metrics";
import {
  jobSearchRankingBoostSchema,
  jobSearchRemotePreferenceSchema,
  jobSeekerIntentSchema,
  jobSeekerToolNameSchema,
  jobWorkplaceTypeSchema,
} from "@/packages/contracts/src";
import { traceSpan } from "@/lib/tracing";
import { getFallbackHomepageReply } from "@/packages/homepage-assistant/src/fallback";
import {
  buildClassifierPrompt,
  buildGeneralResponsePrompt,
  buildPlannerPrompt,
  buildSearchResponsePrompt,
  buildWebSearchResponsePrompt,
} from "./prompts";
import { isJobIntent } from "@/lib/jobs/is-job-intent";
import type {
  HomepageAssistantAttachment,
  JobSeekerAgentModel,
  JobSeekerClassifierOutput,
  JobSeekerConversationMessage,
  JobSeekerPlannerOutput,
} from "./types";
import { z } from "zod";

const plannerFiltersSchema = z.object({
  companies: z.array(z.string()),
  employmentType: z.string().nullable(),
  exclusions: z.array(z.string()),
  industries: z.array(z.string()),
  keywords: z.array(z.string()),
  location: z.string().nullable(),
  locations: z.array(z.string()),
  postedWithinDays: z.number().int().positive().nullable(),
  role: z.string().nullable(),
  roleFamilies: z.array(z.string()),
  rankingBoosts: z.array(jobSearchRankingBoostSchema),
  remotePreference: jobSearchRemotePreferenceSchema.nullable(),
  salaryMax: z.number().nonnegative().nullable(),
  salaryMin: z.number().nonnegative().nullable(),
  seniority: z.string().nullable(),
  skills: z.array(z.string()),
  targetJobId: z.string().nullable(),
  workplaceType: jobWorkplaceTypeSchema.nullable(),
});

const classifierOutputSchema = z.object({
  confidence: z.number().min(0).max(1),
  intent: jobSeekerIntentSchema,
});

const plannerOutputSchema = z.object({
  clarificationQuestion: z.string().nullable(),
  effectivePrompt: z.string().nullable(),
  filters: plannerFiltersSchema.nullable(),
  selectedTool: jobSeekerToolNameSchema.nullable(),
  shouldUseProfileContext: z.boolean(),
});

function getModelName() {
  return process.env.JOB_SEEKER_AGENT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5";
}

function getModelClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return new ChatOpenAI({
    apiKey,
    model: getModelName(),
    temperature: 0,
  });
}

function formatConversation(messages: Array<{ content: string; role: string }>) {
  return messages
    .slice(-6)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}

function buildGeneralFallbackMessage(args: {
  attachments: HomepageAssistantAttachment[];
  intent: JobSeekerClassifierOutput["intent"];
  profileSummary: string | null;
  userQuery: string;
}) {
  if (args.intent === "profile_or_career_id" && args.profileSummary) {
    return args.profileSummary;
  }

  if (args.intent === "application_help") {
    return "I can help with application strategy, resume positioning, or cover-letter direction. If you want live roles, ask me to search jobs and I’ll ground the answer in the current inventory.";
  }

  return getFallbackHomepageReply(args.userQuery, args.attachments);
}

function buildSearchFallbackMessage(args: {
  clarificationQuestion: string | null;
  jobs: Array<{ companyName: string; location: string | null; matchSummary?: string; title: string }>;
  resultQuality: string;
}) {
  if (args.jobs.length === 0) {
    if (args.clarificationQuestion) {
      return `I didn’t find strong grounded matches yet. ${args.clarificationQuestion}`;
    }

    return "I didn’t find grounded job matches for that search in the live inventory yet.";
  }

  const lead =
    args.resultQuality === "weak"
      ? "I found a few grounded roles, but the alignment is weaker than I’d like."
      : "I found grounded matches from the live jobs inventory.";
  const topMatches = args.jobs
    .slice(0, 3)
    .map((job) => {
      const location = job.location ? ` (${job.location})` : "";

      return `${job.title} at ${job.companyName}${location}`;
    })
    .join("; ");

  return `${lead} Best fits: ${topMatches}.`;
}

function buildWebSearchFallbackMessage(args: {
  freshness: string;
  queryUsed: string;
  results: Array<{
    published_at?: string | null;
    snippet: string;
    source: string;
    title: string;
    url: string;
  }>;
}) {
  if (args.results.length === 0) {
    return "I couldn’t find grounded current public results for that question right now.";
  }

  const topSources = args.results
    .slice(0, 3)
    .map((result) => {
      const publishedAt = result.published_at ? ` (${result.published_at})` : "";

      return `${result.source}: ${result.title}${publishedAt}`;
    })
    .join("; ");

  return `I searched the public web for ${args.queryUsed}. The strongest current signals came from ${topSources}.`;
}

function detectFallbackIntent(message: string) {
  const normalized = message.trim().toLowerCase();

  if (!normalized) {
    return "unsupported" as const;
  }

  if (
    isJobIntent(normalized) ||
    /\b(remote|hybrid|onsite|on-site)\b/i.test(normalized)
  ) {
    return "job_search" as const;
  }

  if (/\b(career id|profile|background|experience)\b/i.test(normalized)) {
    return "profile_or_career_id" as const;
  }

  if (/\b(apply|application|resume|cover letter|interview)\b/i.test(normalized)) {
    return "application_help" as const;
  }

  return "general_chat" as const;
}

function buildProfileSummary(profileContext: JobSeekerPlannerOutput["filters"] | null, headline: string | null, location: string | null, targetRole: string | null) {
  const segments = [headline, targetRole, location].filter(Boolean);

  if (!segments.length && !profileContext) {
    return null;
  }

  return `Your Career ID context currently points to ${segments.join(" • ")}. I can use that to rank job matches when you want a broader search.`;
}

type LangChainUsageCarrier = {
  usage_metadata?: {
    input_token_details?: {
      cache_creation?: number | null;
      cache_read?: number | null;
    } | null;
    input_tokens?: number | null;
    output_token_details?: {
      reasoning?: number | null;
    } | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
  } | null;
};

type LangChainMessageLike = LangChainUsageCarrier & {
  content?: unknown;
};

type StructuredOutputResult<TResult> = {
  parsed: TResult;
  raw?: LangChainMessageLike | null;
};

function buildReplyPreview(reply: string) {
  return reply.slice(0, 160);
}

function buildJobSeekerTraceMetadata(promptVersion: string) {
  return {
    model_name: getModelName(),
    prompt_version: promptVersion,
    provider: "openai",
    workflow_id: "job_seeker_agent.run",
  };
}

function buildJobSeekerTraceTags(...tags: string[]) {
  return ["provider:openai", "workflow:job_seeker_agent", ...tags];
}

function buildConversationInputMetadata(messages: JobSeekerConversationMessage[]) {
  return {
    conversation_preview: formatConversation(messages) || null,
    message_count: messages.length,
  };
}

async function traceJobSeekerLLMCall<TResult>(args: {
  input: Record<string, unknown>;
  messageForMetrics?: (result: TResult) => LangChainUsageCarrier | null | undefined;
  name: string;
  output: (result: TResult) => Record<string, unknown>;
  promptVersion: string;
  tags: string[];
  work: () => Promise<TResult>;
}) {
  const startedAtMs = Date.now();
  let endedAtMs = startedAtMs;

  return traceSpan(
    {
      input: args.input,
      metadata: buildJobSeekerTraceMetadata(args.promptVersion),
      metrics: (result: TResult) =>
        buildLangChainUsageMetrics(args.messageForMetrics?.(result), {
          endedAtMs,
          startedAtMs,
        }),
      name: args.name,
      output: args.output,
      tags: buildJobSeekerTraceTags(...args.tags),
      type: "llm",
    },
    async () => {
      const result = await args.work();
      endedAtMs = Date.now();
      return result;
    },
  );
}

export function createLiveJobSeekerAgentModel(): JobSeekerAgentModel {
  const client = getModelClient();
  const classifier = client?.withStructuredOutput(classifierOutputSchema, {
    includeRaw: true,
    name: "job_seeker_intent",
    strict: true,
  });
  const planner = client?.withStructuredOutput(plannerOutputSchema, {
    includeRaw: true,
    name: "job_seeker_plan",
    strict: true,
  });

  return {
    async classifyIntent(args) {
      if (!classifier) {
        return {
          confidence: 0.51,
          extractedFilters: null,
          intent: detectFallbackIntent(args.userQuery),
        };
      }

      const output = await traceJobSeekerLLMCall<StructuredOutputResult<z.infer<typeof classifierOutputSchema>>>({
        input: {
          ...buildConversationInputMetadata(args.messages),
          has_profile_context: Boolean(args.profileContext),
          prior_job_search_query: args.priorJobSearchQuery,
          user_query: args.userQuery,
        },
        messageForMetrics: (result) => result.raw,
        name: "llm.job_seeker.classify_intent",
        output: (result) => ({
          confidence: result.parsed.confidence,
          intent: result.parsed.intent,
        }),
        promptVersion: "job_seeker.classify_intent.v1",
        tags: ["step:classify_intent"],
        work: () =>
          classifier.invoke([
            new SystemMessage(buildClassifierPrompt()),
            new HumanMessage(
              [
                `Latest user request: ${args.userQuery}`,
                args.priorJobSearchQuery ? `Prior job search request: ${args.priorJobSearchQuery}` : null,
                args.profileContext
                  ? `Profile context: ${JSON.stringify(args.profileContext)}`
                  : "Profile context: none",
                formatConversation(args.messages)
                  ? `Recent conversation:\n${formatConversation(args.messages)}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
          ]) as Promise<StructuredOutputResult<z.infer<typeof classifierOutputSchema>>>,
      });

      return {
        confidence: output.parsed.confidence,
        extractedFilters: null,
        intent: output.parsed.intent,
      };
    },

    async composeGeneralResponse(args) {
      if (!client) {
        return buildGeneralFallbackMessage({
          attachments: args.attachments,
          intent: args.intent,
          profileSummary: buildProfileSummary(
            null,
            args.profileContext?.headline ?? null,
            args.profileContext?.location ?? null,
            args.profileContext?.targetRole ?? null,
          ),
          userQuery: args.userQuery,
        });
      }

      const reply = await traceJobSeekerLLMCall<LangChainMessageLike>({
        input: {
          ...buildConversationInputMetadata(args.messages),
          attachment_count: args.attachments.length,
          has_profile_context: Boolean(args.profileContext),
          intent: args.intent,
          user_query: args.userQuery,
        },
        messageForMetrics: (result) => result,
        name: "llm.job_seeker.compose_general_response",
        output: (result) => {
          const content = typeof result.content === "string" ? result.content.trim() : "";

          return {
            intent: args.intent,
            output_preview: buildReplyPreview(content),
            output_text_length: content.length,
          };
        },
        promptVersion: "job_seeker.compose_general_response.v1",
        tags: ["step:compose_general_response"],
        work: () =>
          client.invoke([
            new SystemMessage(buildGeneralResponsePrompt()),
            new HumanMessage(
              [
                `Intent: ${args.intent}`,
                `Latest user request: ${args.userQuery}`,
                args.profileContext
                  ? `Profile context: ${JSON.stringify(args.profileContext)}`
                  : "Profile context: none",
                args.attachments.length > 0
                  ? `Attachments: ${JSON.stringify(args.attachments)}`
                  : "Attachments: none",
                formatConversation(args.messages)
                  ? `Recent conversation:\n${formatConversation(args.messages)}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
          ]) as Promise<LangChainMessageLike>,
      });

      const content = typeof reply.content === "string" ? reply.content.trim() : "";

      if (content) {
        return content;
      }

      return buildGeneralFallbackMessage({
        attachments: args.attachments,
        intent: args.intent,
        profileSummary: buildProfileSummary(
          null,
          args.profileContext?.headline ?? null,
          args.profileContext?.location ?? null,
          args.profileContext?.targetRole ?? null,
        ),
        userQuery: args.userQuery,
      });
    },

    async composeSearchResponse(args) {
      if (!client) {
        return buildSearchFallbackMessage(args);
      }

      const reply = await traceJobSeekerLLMCall<LangChainMessageLike>({
        input: {
          clarification_question: args.clarificationQuestion,
          has_profile_context: Boolean(args.profileContext),
          job_count: args.jobs.length,
          normalized_query: args.query,
          result_quality: args.resultQuality,
          user_query: args.userQuery,
        },
        messageForMetrics: (result) => result,
        name: "llm.job_seeker.compose_search_response",
        output: (result) => {
          const content = typeof result.content === "string" ? result.content.trim() : "";

          return {
            job_count: args.jobs.length,
            output_preview: buildReplyPreview(content),
            output_text_length: content.length,
            result_quality: args.resultQuality,
          };
        },
        promptVersion: "job_seeker.compose_search_response.v1",
        tags: ["step:compose_search_response"],
        work: () =>
          client.invoke([
            new SystemMessage(buildSearchResponsePrompt()),
            new HumanMessage(
              [
                `Latest user request: ${args.userQuery}`,
                `Result quality: ${args.resultQuality}`,
                args.clarificationQuestion
                  ? `Clarification question to preserve if needed: ${args.clarificationQuestion}`
                  : null,
                `Normalized query: ${JSON.stringify(args.query)}`,
                args.profileContext
                  ? `Profile context: ${JSON.stringify(args.profileContext)}`
                  : "Profile context: none",
                `Grounded jobs: ${JSON.stringify(
                  args.jobs.map((job) => ({
                    companyName: job.companyName,
                    location: job.location,
                    matchSummary: job.matchSummary ?? null,
                    relevanceScore: job.relevanceScore ?? null,
                    title: job.title,
                  })),
                )}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
          ]) as Promise<LangChainMessageLike>,
      });

      const content = typeof reply.content === "string" ? reply.content.trim() : "";

      if (content) {
        return content;
      }

      return buildSearchFallbackMessage(args);
    },

    async composeWebSearchResponse(args) {
      if (!client) {
        return buildWebSearchFallbackMessage(args);
      }

      const reply = await traceJobSeekerLLMCall<LangChainMessageLike>({
        input: {
          freshness: args.freshness,
          query_used: args.queryUsed,
          result_count: args.results.length,
          user_query: args.userQuery,
        },
        messageForMetrics: (result) => result,
        name: "llm.job_seeker.compose_web_search_response",
        output: (result) => {
          const content = typeof result.content === "string" ? result.content.trim() : "";

          return {
            freshness: args.freshness,
            output_preview: buildReplyPreview(content),
            output_text_length: content.length,
            result_count: args.results.length,
          };
        },
        promptVersion: "job_seeker.compose_web_search_response.v1",
        tags: ["step:compose_web_search_response"],
        work: () =>
          client.invoke([
            new SystemMessage(buildWebSearchResponsePrompt()),
            new HumanMessage(
              [
                `Latest user request: ${args.userQuery}`,
                `Freshness: ${args.freshness}`,
                `Query used: ${args.queryUsed}`,
                `Grounded public results: ${JSON.stringify(args.results)}`,
              ].join("\n\n"),
            ),
          ]) as Promise<LangChainMessageLike>,
      });

      const content = typeof reply.content === "string" ? reply.content.trim() : "";

      if (content) {
        return content;
      }

      return buildWebSearchFallbackMessage(args);
    },

    async planAction(args) {
      if (!planner) {
        return {
          clarificationQuestion: null,
          effectivePrompt: args.userQuery,
          filters: null,
          selectedTool: args.intent === "job_search" || args.intent === "job_refinement" ? "searchJobs" : null,
          shouldUseProfileContext:
            /\b(for me|my background|my profile|aligned with my)\b/i.test(args.userQuery),
        };
      }

      const output = await traceJobSeekerLLMCall<StructuredOutputResult<z.infer<typeof plannerOutputSchema>>>({
        input: {
          ...buildConversationInputMetadata(args.messages),
          has_profile_context: Boolean(args.profileContext),
          intent: args.intent,
          prior_job_search_query: args.priorJobSearchQuery,
          user_query: args.userQuery,
        },
        messageForMetrics: (result) => result.raw,
        name: "llm.job_seeker.plan_action",
        output: (result) => ({
          clarification_question: result.parsed.clarificationQuestion,
          has_filters: Boolean(result.parsed.filters),
          selected_tool: result.parsed.selectedTool,
          should_use_profile_context: result.parsed.shouldUseProfileContext,
        }),
        promptVersion: "job_seeker.plan_action.v1",
        tags: ["step:plan_action"],
        work: () =>
          planner.invoke([
            new SystemMessage(buildPlannerPrompt()),
            new HumanMessage(
              [
                `Intent: ${args.intent}`,
                `Latest user request: ${args.userQuery}`,
                args.priorJobSearchQuery ? `Prior job search request: ${args.priorJobSearchQuery}` : null,
                args.profileContext
                  ? `Profile context: ${JSON.stringify(args.profileContext)}`
                  : "Profile context: none",
                formatConversation(args.messages)
                  ? `Recent conversation:\n${formatConversation(args.messages)}`
                  : null,
              ]
                .filter(Boolean)
                .join("\n\n"),
            ),
          ]) as Promise<StructuredOutputResult<z.infer<typeof plannerOutputSchema>>>,
      });

      return output.parsed;
    },
  };
}
