import { jobSeekerToolNameSchema } from "@/packages/contracts/src";
import { z } from "zod";
import { searchWebFreshnessSchema } from "./tool-registry";

export const jobSeekerRoutingBucketSchema = z.enum([
  "static_knowledge",
  "internal_platform_data",
  "user_specific_profile_data",
  "current_external_information",
  "action_workflow_execution",
]);

export const jobSeekerRoutingDecisionSchema = z.object({
  bucket: jobSeekerRoutingBucketSchema,
  freshness: searchWebFreshnessSchema,
  matchedSignals: z.array(z.string()),
  preferredTool: jobSeekerToolNameSchema.nullable(),
  reason: z.string(),
  requiresFreshExternalSearch: z.boolean(),
});

const internalPlatformPattern =
  /\b(our platform|our database|our system|our inventory|internal inventory|internal jobs|live inventory|connected sources)\b/i;
const internalPlatformJobPattern =
  /\b(job|jobs|role|roles|position|positions|hiring|company|companies|opening|openings)\b/i;
const userProfilePattern =
  /\b(my background|my profile|my career id|my experience|my resume|my skills|for me|this candidate|candidate(?:'s)? background|candidate(?:'s)? profile|their background|their profile)\b/i;
const actionWorkflowPattern =
  /\b(apply|application|resume|cover letter|interview|rewrite|edit|improve|prepare|draft|upload|create|update|save)\b/i;
const publicMarketTopicPattern =
  /\b(job market|market|hiring|recruiting|recruiters?|layoffs?|skills?|roles?|companies?|demand|trends?)\b/i;

const freshnessSignals = [
  { freshness: "day" as const, label: "right now", pattern: /\bright now\b/i },
  { freshness: "day" as const, label: "currently", pattern: /\bcurrently\b/i },
  { freshness: "day" as const, label: "latest", pattern: /\blatest\b/i },
  { freshness: "day" as const, label: "today", pattern: /\btoday\b/i },
  {
    freshness: "day" as const,
    label: "current market language",
    pattern:
      /\bcurrent(?:ly)?\b.{0,24}\b(job market|market|role|roles|trend|trends|hiring|skills?|recruiting|companies?)\b|\b(job market|market|role|roles|trend|trends|hiring|skills?|recruiting|companies?)\b.{0,24}\bcurrent(?:ly)?\b/i,
  },
  { freshness: "week" as const, label: "this week", pattern: /\bthis week\b/i },
  {
    freshness: "week" as const,
    label: "recent",
    pattern:
      /\brecent(?:ly)?\b|\b(latest|recent|current)\b.{0,12}\blayoffs?\b|\blayoffs?\b.{0,12}\b(latest|recent|current)\b/i,
  },
  { freshness: "month" as const, label: "this month", pattern: /\bthis month\b/i },
  { freshness: "month" as const, label: "trending", pattern: /\btrending\b/i },
  { freshness: "month" as const, label: "hot", pattern: /\bhot(?:test)?\b/i },
  { freshness: "month" as const, label: "in demand", pattern: /\bin[- ]demand\b/i },
  { freshness: "month" as const, label: "hiring most", pattern: /\bhiring(?: for)? the most\b/i },
  { freshness: "month" as const, label: "recruiting trends", pattern: /\brecruiting trends?\b/i },
  { freshness: "month" as const, label: "skills trending", pattern: /\bskills?\b.{0,16}\btrending\b/i },
];

const explicitCurrentExternalPatterns = [
  /\bwhat roles? (?:are )?hot\b/i,
  /\bhottest\b.{0,20}\bjobs?\b/i,
  /\bcompanies?\b.{0,20}\bhiring\b/i,
  /\blatest layoffs?\b/i,
  /\bin-demand\b.{0,20}\broles?\b/i,
  /\bcurrent recruiting trends?\b/i,
  /\bskills?\b.{0,20}\btrending\b/i,
];

function normalize(input: string) {
  return input.trim().toLowerCase();
}

function pickFreshness(matches: Array<z.infer<typeof searchWebFreshnessSchema>>) {
  if (matches.includes("day")) {
    return "day" as const;
  }

  if (matches.includes("week")) {
    return "week" as const;
  }

  if (matches.includes("month")) {
    return "month" as const;
  }

  return "any" as const;
}

function buildMatchedSignals(input: string) {
  const matches = freshnessSignals
    .filter((signal) => signal.pattern.test(input))
    .map((signal) => signal.label);

  if (explicitCurrentExternalPatterns.some((pattern) => pattern.test(input))) {
    matches.push("explicit current-market question");
  }

  return Array.from(new Set(matches));
}

export function classifyJobSeekerRouting(userQuery: string) {
  const normalized = normalize(userQuery);
  const matchedSignals = buildMatchedSignals(normalized);
  const freshness = pickFreshness(
    freshnessSignals
      .filter((signal) => signal.pattern.test(normalized))
      .map((signal) => signal.freshness),
  );
  const asksForInternalPlatformJobs =
    internalPlatformPattern.test(normalized) && internalPlatformJobPattern.test(normalized);
  const asksForUserSpecificContext = userProfilePattern.test(normalized);
  const looksLikeCurrentExternalInfo =
    explicitCurrentExternalPatterns.some((pattern) => pattern.test(normalized)) ||
    (matchedSignals.length > 0 && publicMarketTopicPattern.test(normalized));

  if (asksForInternalPlatformJobs) {
    const prefersLatestInventory =
      /\b(latest|newest|new|recent|recently posted|current)\b/i.test(normalized) &&
      !/\bfor me\b/i.test(normalized);

    return jobSeekerRoutingDecisionSchema.parse({
      bucket: "internal_platform_data",
      freshness,
      matchedSignals,
      preferredTool: prefersLatestInventory ? "browseLatestJobs" : "searchJobs",
      reason:
        "The request explicitly asks about Career AI's internal platform or job inventory, so internal retrieval should win over web search.",
      requiresFreshExternalSearch: false,
    });
  }

  if (asksForUserSpecificContext) {
    return jobSeekerRoutingDecisionSchema.parse({
      bucket: "user_specific_profile_data",
      freshness: "any",
      matchedSignals,
      preferredTool: "getUserCareerProfile",
      reason:
        "The request is about a specific user or candidate profile, so profile retrieval should be used instead of public search.",
      requiresFreshExternalSearch: false,
    });
  }

  if (looksLikeCurrentExternalInfo) {
    return jobSeekerRoutingDecisionSchema.parse({
      bucket: "current_external_information",
      freshness: freshness === "any" ? "month" : freshness,
      matchedSignals,
      preferredTool: "search_web",
      reason:
        "The request asks for current public market information that can change over time, so it should be grounded with web search before answering.",
      requiresFreshExternalSearch: true,
    });
  }

  if (actionWorkflowPattern.test(normalized)) {
    return jobSeekerRoutingDecisionSchema.parse({
      bucket: "action_workflow_execution",
      freshness: "any",
      matchedSignals,
      preferredTool: null,
      reason:
        "The request is asking for workflow help or document/application support rather than fresh external information.",
      requiresFreshExternalSearch: false,
    });
  }

  return jobSeekerRoutingDecisionSchema.parse({
    bucket: "static_knowledge",
    freshness: "any",
    matchedSignals,
    preferredTool: null,
    reason:
      "The request can be handled as stable knowledge or normal conversational guidance without forcing a live external search.",
    requiresFreshExternalSearch: false,
  });
}

export function requiresCurrentExternalSearch(userQuery: string) {
  return classifyJobSeekerRouting(userQuery).requiresFreshExternalSearch;
}

export type JobSeekerRoutingBucket = z.infer<typeof jobSeekerRoutingBucketSchema>;
export type JobSeekerRoutingDecision = z.infer<typeof jobSeekerRoutingDecisionSchema>;
