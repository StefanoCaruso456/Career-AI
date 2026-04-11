import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {
  jobSearchRankingBoostSchema,
  jobSearchRemotePreferenceSchema,
  jobSeekerIntentSchema,
  jobSeekerToolNameSchema,
  jobWorkplaceTypeSchema,
} from "@/packages/contracts/src";
import { getFallbackHomepageReply } from "@/packages/homepage-assistant/src/fallback";
import {
  buildClassifierPrompt,
  buildGeneralResponsePrompt,
  buildPlannerPrompt,
  buildSearchResponsePrompt,
} from "./prompts";
import { isJobIntent } from "@/lib/jobs/is-job-intent";
import type {
  HomepageAssistantAttachment,
  JobSeekerAgentModel,
  JobSeekerClassifierOutput,
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
      const reason = job.matchSummary ? ` because ${job.matchSummary}` : "";

      return `${job.title} at ${job.companyName}${location}${reason}`;
    })
    .join("; ");

  return `${lead} Best fits: ${topMatches}.`;
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

export function createLiveJobSeekerAgentModel(): JobSeekerAgentModel {
  const client = getModelClient();
  const classifier = client?.withStructuredOutput(classifierOutputSchema, {
    name: "job_seeker_intent",
    strict: true,
  });
  const planner = client?.withStructuredOutput(plannerOutputSchema, {
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

      const output = await classifier.invoke([
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
      ]);

      return {
        confidence: output.confidence,
        extractedFilters: null,
        intent: output.intent,
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

      const reply = await client.invoke([
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
      ]);

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

      const reply = await client.invoke([
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
      ]);

      const content = typeof reply.content === "string" ? reply.content.trim() : "";

      if (content) {
        return content;
      }

      return buildSearchFallbackMessage(args);
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

      const output = await planner.invoke([
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
      ]);

      return output;
    },
  };
}
