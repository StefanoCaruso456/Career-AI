import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import {
  jobSearchFiltersSchema,
  jobSeekerAgentTraceEntrySchema,
  jobSeekerIntentSchema,
  jobSeekerProfileContextSchema,
  jobSeekerResultQualitySchema,
  jobSeekerToolNameSchema,
  jobsPanelResponseSchema,
} from "@/packages/contracts/src";
import { getFallbackHomepageReply } from "@/packages/homepage-assistant/src/fallback";
import { normalizeHumanLabel } from "@/packages/jobs-domain/src/metadata";
import { parseJobSearchQuery } from "@/packages/jobs-domain/src";
import { isJobIntent } from "@/lib/jobs/is-job-intent";
import { classifyJobSeekerRouting, jobSeekerRoutingDecisionSchema } from "./query-routing";
import { searchWebToolOutputSchema } from "./tool-registry";
import type {
  JobSearchCatalogResult,
  JobSeekerAgentInput,
  JobSeekerAgentModel,
  JobSeekerAgentResult,
  JobSeekerAgentState,
  JobSeekerConversationMessage,
  JobSeekerPlannerOutput,
  JobSeekerToolInput,
  JobSeekerToolSet,
  SearchJobsToolInput,
} from "./types";
import { z } from "zod";

const jobSeekerAgentStateSchema = new StateSchema({
  attachments: z.array(
    z.object({
      mimeType: z.string(),
      name: z.string(),
      size: z.number().int().nonnegative(),
    }),
  ),
  conversationId: z.string().nullable(),
  debugTrace: z.array(jobSeekerAgentTraceEntrySchema),
  extractedFilters: jobSearchFiltersSchema.nullable(),
  intent: jobSeekerIntentSchema.nullable(),
  intentConfidence: z.number().min(0).max(1).nullable(),
  lastSearchResult: z.any().nullable(),
  lastToolKind: jobSeekerToolNameSchema.nullable(),
  lastWebSearchResult: searchWebToolOutputSchema.nullable(),
  loopCount: z.number().int().nonnegative(),
  maxLoops: z.number().int().nonnegative(),
  messages: z.array(
    z.object({
      content: z.string(),
      role: z.enum(["assistant", "user"]),
    }),
  ),
  normalizedQuery: z.string(),
  normalizedToolResult: z.any().nullable(),
  ownerId: z.string().nullable(),
  priorJobSearchQuery: z.string().nullable(),
  profileContext: jobSeekerProfileContextSchema.nullable(),
  responsePayload: z.any().nullable(),
  resultQuality: jobSeekerResultQualitySchema.nullable(),
  routingDecision: jobSeekerRoutingDecisionSchema.nullable(),
  selectedTool: jobSeekerToolNameSchema.nullable(),
  shouldTerminate: z.boolean(),
  terminationReason: z.string().nullable(),
  toolArgs: z.any().nullable(),
  toolResult: z.any().nullable(),
  userQuery: z.string(),
});

function appendTrace(
  state: JobSeekerAgentState,
  step: string,
  summary: string,
  data?: Record<string, unknown> | null,
) {
  return [
    ...state.debugTrace,
    {
      data: data ?? null,
      step,
      summary,
      timestamp: new Date().toISOString(),
    },
  ];
}

function findPriorJobSearchQuery(messages: JobSeekerConversationMessage[], currentQuery: string) {
  const normalizedCurrent = normalizeHumanLabel(currentQuery);

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role !== "user") {
      continue;
    }

    const candidate = message.content.trim();

    if (!candidate || normalizeHumanLabel(candidate) === normalizedCurrent) {
      continue;
    }

    if (isJobIntent(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isLikelyJobRefinement(query: string, priorJobSearchQuery: string | null) {
  if (!priorJobSearchQuery) {
    return false;
  }

  const normalized = normalizeHumanLabel(query);

  return (
    /^more$/i.test(query.trim()) ||
    /^show more$/i.test(query.trim()) ||
    /\b(remote|hybrid|onsite|on-site|entry level|junior|senior|staff|principal)\b/i.test(normalized) ||
    /\b(only|include|exclude|without|broaden|widen|expand|narrow)\b/i.test(normalized) ||
    /\b(in|near|around)\s+[a-z]/i.test(normalized) ||
    /\b(similar|like that|like those|same kind)\b/i.test(normalized)
  );
}

function detectHeuristicIntent(query: string, priorJobSearchQuery: string | null) {
  const normalized = normalizeHumanLabel(query);

  if (!normalized) {
    return {
      confidence: 0.35,
      intent: "unsupported" as const,
    };
  }

  if (isLikelyJobRefinement(query, priorJobSearchQuery)) {
    return {
      confidence: 0.9,
      intent: "job_refinement" as const,
    };
  }

  if (isJobIntent(query)) {
    return {
      confidence: 0.94,
      intent: "job_search" as const,
    };
  }

  if (/\b(career id|profile|background|experience|what do you know about me)\b/i.test(normalized)) {
    return {
      confidence: 0.82,
      intent: "profile_or_career_id" as const,
    };
  }

  if (/\b(apply|application|resume|cover letter|interview)\b/i.test(normalized)) {
    return {
      confidence: 0.8,
      intent: "application_help" as const,
    };
  }

  return {
    confidence: 0.58,
    intent: "general_chat" as const,
  };
}

function needsProfileContext(state: JobSeekerAgentState) {
  if (!state.ownerId?.startsWith("user:")) {
    return false;
  }

  const normalized = state.normalizedQuery;

  if (/\b(for me|my background|my profile|aligned with my|fit my)\b/i.test(normalized)) {
    return true;
  }

  return Boolean(
    !state.profileContext &&
      (state.intent === "job_refinement" ||
        (state.intent === "job_search" &&
          !state.extractedFilters?.role &&
          !state.extractedFilters?.location &&
          !state.extractedFilters?.skills.length)),
  );
}

function toCandidateDefaults(profileContext: JobSeekerAgentState["profileContext"]) {
  if (!profileContext) {
    return null;
  }

  return {
    careerIdentityId: profileContext.careerIdentityId,
    headline: profileContext.headline,
    location: profileContext.location,
    signals: profileContext.signals,
    targetRole: profileContext.targetRole,
  };
}

function mergeFilters(
  baseFilters: JobSeekerAgentState["extractedFilters"],
  nextFilters: JobSeekerAgentState["extractedFilters"],
) {
  const base = baseFilters ?? {
    companies: [],
    employmentType: null,
    exclusions: [],
    industries: [],
    keywords: [],
    location: null,
    locations: [],
    postedWithinDays: null,
    role: null,
    roleFamilies: [],
    rankingBoosts: [],
    remotePreference: null,
    salaryMax: null,
    salaryMin: null,
    seniority: null,
    skills: [],
    targetJobId: null,
    workplaceType: null,
  };
  const next = nextFilters ?? null;

  if (!next) {
    return base;
  }

  return {
    companies: next.companies.length > 0 ? next.companies : base.companies,
    employmentType: next.employmentType ?? base.employmentType,
    exclusions: next.exclusions.length > 0 ? next.exclusions : base.exclusions,
    industries: next.industries.length > 0 ? next.industries : base.industries,
    keywords: next.keywords.length > 0 ? next.keywords : base.keywords,
    location: next.location ?? base.location,
    locations: next.locations.length > 0 ? next.locations : base.locations,
    postedWithinDays: next.postedWithinDays ?? base.postedWithinDays,
    role: next.role ?? base.role,
    roleFamilies: next.roleFamilies.length > 0 ? next.roleFamilies : base.roleFamilies,
    rankingBoosts:
      next.rankingBoosts.length > 0
        ? Array.from(new Set([...base.rankingBoosts, ...next.rankingBoosts]))
        : base.rankingBoosts,
    remotePreference: next.remotePreference ?? base.remotePreference,
    salaryMax: next.salaryMax ?? base.salaryMax,
    salaryMin: next.salaryMin ?? base.salaryMin,
    seniority: next.seniority ?? base.seniority,
    skills: next.skills.length > 0 ? next.skills : base.skills,
    targetJobId: next.targetJobId ?? base.targetJobId,
    workplaceType: next.workplaceType ?? base.workplaceType,
  };
}

function buildEffectivePrompt(filters: JobSeekerAgentState["extractedFilters"], fallbackPrompt: string) {
  if (!filters) {
    return fallbackPrompt;
  }

  const parts = [
    filters.workplaceType ? `${filters.workplaceType} roles` : "jobs",
    filters.role ? `for ${filters.role}` : null,
    filters.location ? `in ${filters.location}` : null,
    filters.skills.length > 0 ? `with ${filters.skills.join(", ")}` : null,
    filters.companies.length > 0 ? `at ${filters.companies.join(", ")}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? `Find ${parts.join(" ")}` : fallbackPrompt;
}

function buildSearchQueryFromState(
  state: JobSeekerAgentState,
  plannerFilters: JobSeekerAgentState["extractedFilters"],
  effectivePrompt: string | null,
  shouldUseProfileContext: boolean,
) {
  const parsedFallback = parseJobSearchQuery({
    candidateDefaults: toCandidateDefaults(state.profileContext),
    prompt: effectivePrompt ?? state.userQuery,
  });
  const filters = mergeFilters(parsedFallback.filters, plannerFilters);
  const resolvedPrompt =
    effectivePrompt ??
    (state.intent === "job_refinement" && state.priorJobSearchQuery
      ? `${state.priorJobSearchQuery}. Refine with: ${state.userQuery}`
      : state.userQuery);

  return {
    careerIdSignals: state.profileContext?.signals ?? parsedFallback.careerIdSignals,
    conversationContext: state.priorJobSearchQuery,
    effectivePrompt: resolvedPrompt,
    filters,
    normalizedPrompt: normalizeHumanLabel(resolvedPrompt),
    prompt: state.userQuery,
    usedCareerIdDefaults: shouldUseProfileContext,
  };
}

function assessSearchResultQuality(state: JobSeekerAgentState, result: JobSearchCatalogResult | null) {
  if (!result || result.results.length === 0) {
    return "empty" as const;
  }

  if (result.resultQuality) {
    return result.resultQuality;
  }

  const topScore = result.results[0]?.relevanceScore ?? 0;
  const titleAligned = result.results.filter((job) =>
    job.matchReasons?.some((signal) => signal.includes("title aligned")) ||
    job.matchSignals?.some((signal) => signal.includes("title aligned")),
  ).length;
  const locationAligned = result.results.filter((job) =>
    job.matchReasons?.some((signal) => signal.includes("location")) ||
    job.matchSignals?.some((signal) => signal.includes("location aligned")),
  ).length;
  const skillAligned = result.results.filter((job) =>
    job.matchReasons?.some((signal) => signal.includes("skill")) ||
    job.matchSignals?.some((signal) => signal.includes("skill")),
  ).length;
  const hasRoleConstraint = Boolean(result.query.filters.role);
  const hasLocationConstraint = Boolean(result.query.filters.location);
  const hasSkillConstraint = result.query.filters.skills.length > 0;

  let alignmentSignals = 0;

  if (!hasRoleConstraint || titleAligned > 0) {
    alignmentSignals += 1;
  }

  if (!hasLocationConstraint || locationAligned > 0) {
    alignmentSignals += 1;
  }

  if (!hasSkillConstraint || skillAligned > 0) {
    alignmentSignals += 1;
  }

  if (topScore >= 0.82 && alignmentSignals >= 2 && result.results.length >= 3) {
    return "strong" as const;
  }

  if (topScore >= 0.58 || (alignmentSignals >= 2 && result.results.length >= 2)) {
    return "acceptable" as const;
  }

  return "weak" as const;
}

function deriveAdjacentRoleFamilies(role: string | null) {
  if (!role) {
    return [];
  }

  const normalized = normalizeHumanLabel(role);

  if (normalized.includes("product")) {
    return ["product manager", "product operations", "product strategy"];
  }

  if (normalized.includes("data analyst")) {
    return ["data analyst", "business analyst", "analytics"];
  }

  if (normalized.includes("machine learning") || normalized.includes("ml")) {
    return ["machine learning engineer", "ai engineer", "data scientist"];
  }

  return [role];
}

function broadenSearchResult(result: JobSearchCatalogResult) {
  const nextFilters = structuredClone(result.query.filters);
  let reason: string | null = null;
  let clarificationQuestion: string | null = null;

  if (nextFilters.location && nextFilters.workplaceType === "remote") {
    nextFilters.location = null;
    nextFilters.locations = [];
    reason = "relaxed_location_for_remote_search";
  } else if (nextFilters.seniority) {
    nextFilters.seniority = null;
    reason = "relaxed_seniority";
  } else if (nextFilters.skills.length > 2) {
    nextFilters.skills = nextFilters.skills.slice(0, 2);
    reason = "reduced_skill_constraints";
  } else if (nextFilters.companies.length > 0) {
    nextFilters.companies = [];
    reason = "cleared_company_filter";
  } else if (nextFilters.role) {
    const adjacent = deriveAdjacentRoleFamilies(nextFilters.role);

    if (adjacent.length > 1) {
      nextFilters.roleFamilies = adjacent;
      reason = "broadened_role_family";
    }
  } else if (nextFilters.location) {
    nextFilters.location = null;
    nextFilters.locations = [];
    reason = "cleared_location_filter";
  } else if (result.query.filters.location && result.query.filters.workplaceType === "remote") {
    clarificationQuestion = `Do you want remote-only roles, or ${result.query.filters.location}-based roles too?`;
  } else if (result.query.filters.role) {
    clarificationQuestion = `Should I keep this focused on ${result.query.filters.role}, or include adjacent roles too?`;
  } else {
    clarificationQuestion = "Should I widen the title or location slightly?";
  }

  if (!reason) {
    return {
      clarificationQuestion,
      nextQuery: null,
      reason: null,
    };
  }

  const effectivePrompt = buildEffectivePrompt(nextFilters, result.query.prompt);

  return {
    clarificationQuestion: null,
    nextQuery: {
      ...result.query,
      effectivePrompt,
      filters: nextFilters,
      normalizedPrompt: normalizeHumanLabel(effectivePrompt),
    },
    reason,
  };
}

function buildSearchToolArgs(state: JobSeekerAgentState, query: JobSearchCatalogResult["query"]): SearchJobsToolInput {
  return {
    conversationId: state.conversationId,
    limit: 24,
    ownerId: state.ownerId,
    profileContext: state.profileContext,
    prompt: query.effectivePrompt ?? query.prompt,
    query,
    refresh: state.loopCount === 0,
  };
}

function buildBrowseLatestJobsToolArgs(state: JobSeekerAgentState) {
  return {
    conversationId: state.conversationId,
    limit: 24,
    ownerId: state.ownerId,
    prompt: state.userQuery,
    refresh: state.loopCount === 0,
  };
}

function buildSearchWebToolArgs(state: JobSeekerAgentState) {
  return {
    freshness: state.routingDecision?.freshness ?? "month",
    query: state.userQuery.trim(),
    top_k: 6,
  };
}

function buildJobsPanel(
  state: JobSeekerAgentState,
  assistantMessage: string,
  result: JobSearchCatalogResult,
  clarificationQuestion: string | null,
) {
  return jobsPanelResponseSchema.parse({
    agent: {
      clarificationQuestion,
      intent: state.intent ?? "job_search",
      intentConfidence: state.intentConfidence ?? 0.5,
      loopCount: state.loopCount,
      maxLoops: state.maxLoops,
      resultQuality: state.resultQuality,
      selectedTool: state.selectedTool,
      terminationReason: state.terminationReason ?? "completed",
    },
    assistantMessage,
    debugTrace: state.debugTrace,
    diagnostics: result.diagnostics,
    generatedAt: result.generatedAt,
    jobs: result.results,
    panelCount: result.returnedCount,
    profileContext: result.profileContext ?? state.profileContext,
    query: result.query,
    rail: result.rail,
    totalMatches: result.totalCandidateCount,
  });
}

function buildSearchFallbackResponse(args: {
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

export function createJobSeekerAgent(deps: {
  model: JobSeekerAgentModel;
  tools: JobSeekerToolSet;
}) {
  const observeContext = async (state: JobSeekerAgentState) => ({
    debugTrace: appendTrace(
      state,
      "observe_context",
      "Normalized request and loaded prior search context.",
      {
        ownerIdAvailable: Boolean(state.ownerId),
        routingBucket: classifyJobSeekerRouting(state.userQuery).bucket,
        userQuery: state.userQuery,
      },
    ),
    normalizedQuery: normalizeHumanLabel(state.userQuery),
    priorJobSearchQuery: findPriorJobSearchQuery(state.messages, state.userQuery),
    routingDecision: classifyJobSeekerRouting(state.userQuery),
  });

  const classifyIntent = async (state: JobSeekerAgentState) => {
    const heuristic = detectHeuristicIntent(state.userQuery, state.priorJobSearchQuery);
    let intent = heuristic.intent;
    let confidence = heuristic.confidence;

    if (heuristic.confidence < 0.9) {
      try {
        const modelOutput = await deps.model.classifyIntent({
          messages: state.messages,
          priorJobSearchQuery: state.priorJobSearchQuery,
          profileContext: state.profileContext,
          userQuery: state.userQuery,
        });

        if (modelOutput.confidence >= heuristic.confidence - 0.05) {
          intent = modelOutput.intent;
          confidence = modelOutput.confidence;
        }
      } catch {
        // Fall back to heuristics only.
      }
    }

    return {
      debugTrace: appendTrace(state, "classify_intent", `Classified intent as ${intent}.`, {
        confidence,
        intent,
        priorJobSearchQuery: state.priorJobSearchQuery,
      }),
      intent,
      intentConfidence: confidence,
    };
  };

  const planNextAction = async (state: JobSeekerAgentState) => {
    if (state.routingDecision?.preferredTool === "search_web") {
      return {
        debugTrace: appendTrace(
          state,
          "plan_next_action",
          "Freshness routing selected search_web before response generation.",
          {
            freshness: state.routingDecision.freshness,
            matchedSignals: state.routingDecision.matchedSignals,
            reason: state.routingDecision.reason,
            selectedTool: "search_web",
          },
        ),
        selectedTool: "search_web" as const,
        shouldTerminate: false,
        terminationReason: null,
        toolArgs: buildSearchWebToolArgs(state),
      };
    }

    if (state.routingDecision?.preferredTool === "browseLatestJobs") {
      return {
        debugTrace: appendTrace(
          state,
          "plan_next_action",
          "Internal platform routing selected browseLatestJobs.",
          {
            selectedTool: "browseLatestJobs",
          },
        ),
        selectedTool: "browseLatestJobs" as const,
        shouldTerminate: false,
        terminationReason: null,
        toolArgs: buildBrowseLatestJobsToolArgs(state),
      };
    }

    if (state.intent === "profile_or_career_id" && state.profileContext) {
      return {
        debugTrace: appendTrace(
          state,
          "plan_next_action",
          "Profile context is already loaded, so the agent can respond without another tool call.",
        ),
        selectedTool: null,
        shouldTerminate: true,
        terminationReason: "profile_context_ready",
        toolArgs: null,
      };
    }

    if (
      state.routingDecision?.preferredTool === "getUserCareerProfile" &&
      state.ownerId &&
      !state.profileContext
    ) {
      return {
        debugTrace: appendTrace(
          state,
          "plan_next_action",
          "Routing selected getUserCareerProfile for user-specific context.",
        ),
        selectedTool: "getUserCareerProfile" as const,
        shouldTerminate: false,
        terminationReason: null,
        toolArgs: {
          ownerId: state.ownerId,
        },
      };
    }

    if (state.intent === "general_chat" || state.intent === "application_help" || state.intent === "unsupported") {
      return {
        debugTrace: appendTrace(state, "plan_next_action", "No tool selected for non-search request.", {
          intent: state.intent,
        }),
        selectedTool: null,
        shouldTerminate: true,
        terminationReason: `${state.intent}_response`,
        toolArgs: null,
      };
    }

    if (state.intent === "profile_or_career_id" && state.ownerId && !state.profileContext) {
      return {
        debugTrace: appendTrace(state, "plan_next_action", "Loading Career ID context for profile response."),
        selectedTool: "getUserCareerProfile" as const,
        shouldTerminate: false,
        terminationReason: null,
        toolArgs: {
          ownerId: state.ownerId,
        },
      };
    }

    if ((state.intent === "job_search" || state.intent === "job_refinement") && !state.profileContext && needsProfileContext(state)) {
      return {
        debugTrace: appendTrace(state, "plan_next_action", "Loading Career ID context before planning search.", {
          intent: state.intent,
        }),
        selectedTool: "getUserCareerProfile" as const,
        shouldTerminate: false,
        terminationReason: null,
        toolArgs: {
          ownerId: state.ownerId,
        },
      };
    }

    let plannerOutput: JobSeekerPlannerOutput = {
      clarificationQuestion: null,
      effectivePrompt: state.userQuery,
      filters: null,
      selectedTool: state.intent === "job_search" || state.intent === "job_refinement" ? "searchJobs" : null,
      shouldUseProfileContext: Boolean(state.profileContext && needsProfileContext(state)),
    };

    if (state.intent === "job_search" || state.intent === "job_refinement") {
      try {
        plannerOutput = await deps.model.planAction({
          intent: state.intent,
          messages: state.messages,
          priorJobSearchQuery: state.priorJobSearchQuery,
          profileContext: state.profileContext,
          userQuery: state.userQuery,
        });
      } catch {
        // Use deterministic fallback below.
      }
    }

    if ((state.intent === "job_search" || state.intent === "job_refinement") && !plannerOutput.selectedTool && !plannerOutput.clarificationQuestion) {
      plannerOutput.selectedTool = "searchJobs";
    }

    if (plannerOutput.clarificationQuestion && !plannerOutput.selectedTool) {
      return {
        debugTrace: appendTrace(state, "plan_next_action", "Planner requested clarification before tool use."),
        responsePayload: {
          assistantMessage: plannerOutput.clarificationQuestion,
          jobsPanel: null,
        },
        selectedTool: null,
        shouldTerminate: true,
        terminationReason: "clarification_required",
        toolArgs: null,
      };
    }

    if (plannerOutput.selectedTool === "getUserCareerProfile") {
      return {
        debugTrace: appendTrace(state, "plan_next_action", "Planner selected getUserCareerProfile."),
        selectedTool: "getUserCareerProfile" as const,
        shouldTerminate: false,
        terminationReason: null,
        toolArgs: {
          ownerId: state.ownerId,
        },
      };
    }

    const query = buildSearchQueryFromState(
      state,
      plannerOutput.filters,
      plannerOutput.effectivePrompt,
      plannerOutput.shouldUseProfileContext,
    );

    return {
      debugTrace: appendTrace(state, "plan_next_action", `Selected ${plannerOutput.selectedTool ?? "searchJobs"} for search.`, {
        effectivePrompt: query.effectivePrompt,
        filters: query.filters,
      }),
      extractedFilters: query.filters,
      selectedTool: plannerOutput.selectedTool ?? "searchJobs",
      shouldTerminate: false,
      terminationReason: null,
      toolArgs: buildSearchToolArgs(state, query),
    };
  };

  const executeTool = async (state: JobSeekerAgentState) => {
    try {
      if (state.selectedTool === "getUserCareerProfile") {
        const profileContext = await deps.tools.getUserCareerProfile({
          ownerId: state.ownerId,
        });

        return {
          debugTrace: appendTrace(state, "execute_tool", "Executed getUserCareerProfile.", {
            profileContextAvailable: Boolean(profileContext),
          }),
          lastToolKind: "getUserCareerProfile" as const,
          normalizedToolResult: profileContext,
          profileContext,
          toolResult: profileContext,
        };
      }

      if (state.selectedTool === "browseLatestJobs") {
        const toolArgs = state.toolArgs as ReturnType<typeof buildBrowseLatestJobsToolArgs>;
        const result = await deps.tools.browseLatestJobs(toolArgs);

        return {
          debugTrace: appendTrace(state, "execute_tool", "Executed browseLatestJobs.", {
            prompt: toolArgs.prompt,
            resultCount: result.results.length,
            totalMatches: result.totalCandidateCount,
          }),
          lastSearchResult: result,
          lastToolKind: "browseLatestJobs" as const,
          normalizedToolResult: result,
          toolResult: result,
        };
      }

      if (state.selectedTool === "getJobById") {
        const toolArgs = state.toolArgs as { jobId: string };
        const job = await deps.tools.getJobById({
          jobId: toolArgs.jobId,
        });

        return {
          debugTrace: appendTrace(state, "execute_tool", "Executed getJobById.", {
            found: Boolean(job),
            jobId: toolArgs.jobId,
          }),
          lastToolKind: "getJobById" as const,
          normalizedToolResult: job,
          toolResult: job,
        };
      }

      if (state.selectedTool === "findSimilarJobs") {
        const toolArgs = state.toolArgs as { jobId: string; limit: number; ownerId: string | null; refresh: boolean };
        const result = await deps.tools.findSimilarJobs({
          jobId: toolArgs.jobId,
          limit: toolArgs.limit,
          ownerId: toolArgs.ownerId,
          refresh: toolArgs.refresh,
        });

        return {
          debugTrace: appendTrace(state, "execute_tool", "Executed findSimilarJobs.", {
            jobCount: result?.results.length ?? 0,
          }),
          lastSearchResult: result,
          lastToolKind: "findSimilarJobs" as const,
          normalizedToolResult: result,
          toolResult: result,
        };
      }

      if (state.selectedTool === "search_web") {
        const toolArgs = state.toolArgs as ReturnType<typeof buildSearchWebToolArgs>;
        const result = await deps.tools.searchWeb(toolArgs);

        return {
          debugTrace: appendTrace(state, "execute_tool", "Executed search_web.", {
            freshness: toolArgs.freshness,
            queryUsed: result.query_used,
            resultCount: result.results.length,
          }),
          lastToolKind: "search_web" as const,
          lastWebSearchResult: result,
          normalizedToolResult: result,
          toolResult: result,
        };
      }

      const toolArgs = state.toolArgs as SearchJobsToolInput;
      const result = await deps.tools.searchJobs(toolArgs);

      return {
        debugTrace: appendTrace(state, "execute_tool", "Executed searchJobs.", {
          effectivePrompt: toolArgs.query.effectivePrompt,
          resultCount: result.results.length,
          totalMatches: result.totalCandidateCount,
        }),
        lastSearchResult: result,
        lastToolKind: "searchJobs" as const,
        normalizedToolResult: result,
        toolResult: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The job tool failed.";

      return {
        debugTrace: appendTrace(state, "execute_tool", "Tool execution failed.", {
          message,
          selectedTool: state.selectedTool,
        }),
        shouldTerminate: true,
        terminationReason: "tool_error",
        toolResult: {
          message,
        },
      };
    }
  };

  const evaluateToolResult = async (state: JobSeekerAgentState) => {
    if (state.selectedTool === "getJobById") {
      const quality = state.normalizedToolResult ? "acceptable" : "empty";

      return {
        debugTrace: appendTrace(state, "evaluate_tool_result", `Evaluated getJobById result as ${quality}.`),
        resultQuality: quality,
        shouldTerminate: true,
        terminationReason: quality === "empty" ? "job_not_found" : "job_lookup_completed",
      };
    }

    if (state.selectedTool === "search_web") {
      const result = state.lastWebSearchResult;
      const quality =
        !result || result.results.length === 0
          ? "empty"
          : result.results.length >= 3
            ? "strong"
            : "acceptable";

      return {
        debugTrace: appendTrace(
          state,
          "evaluate_tool_result",
          `Evaluated search_web result as ${quality}.`,
          {
            freshness: state.routingDecision?.freshness ?? null,
            resultCount: result?.results.length ?? 0,
          },
        ),
        resultQuality: quality,
        shouldTerminate: true,
        terminationReason:
          quality === "empty"
            ? "search_web_empty"
            : "search_web_grounded_results_ready",
      };
    }

    const result = state.lastSearchResult;
    const quality = assessSearchResultQuality(state, result);

    return {
      debugTrace: appendTrace(state, "evaluate_tool_result", `Evaluated search result as ${quality}.`, {
        loopCount: state.loopCount,
        resultCount: result?.results.length ?? 0,
        totalMatches: result?.totalCandidateCount ?? 0,
      }),
      resultQuality: quality,
      shouldTerminate:
        quality === "strong" ||
        quality === "acceptable" ||
        state.loopCount >= state.maxLoops,
      terminationReason:
        quality === "strong" || quality === "acceptable"
          ? "grounded_results_ready"
          : state.loopCount >= state.maxLoops
            ? "max_loops_reached"
            : "needs_refinement",
    };
  };

  const fallbackOrClarify = async (state: JobSeekerAgentState) => {
    if (!state.lastSearchResult) {
      return {
        debugTrace: appendTrace(state, "fallback_or_clarify", "No search result available for fallback."),
        shouldTerminate: true,
        terminationReason: "missing_search_result",
      };
    }

    const broadened = broadenSearchResult(state.lastSearchResult);

    if (broadened.nextQuery) {
      return {
        debugTrace: appendTrace(state, "fallback_or_clarify", `Broadened search once with ${broadened.reason}.`, {
          nextQuery: broadened.nextQuery,
        }),
        extractedFilters: broadened.nextQuery.filters,
        loopCount: state.loopCount + 1,
        selectedTool: "searchJobs" as const,
        shouldTerminate: false,
        terminationReason: broadened.reason,
        toolArgs: buildSearchToolArgs(state, broadened.nextQuery),
      };
    }

    return {
      debugTrace: appendTrace(state, "fallback_or_clarify", "Prepared a targeted clarification instead of broadening."),
      responsePayload: {
        assistantMessage: broadened.clarificationQuestion ?? "I didn’t find strong grounded matches yet.",
        jobsPanel: null,
      },
      shouldTerminate: true,
      terminationReason: "clarification_required",
    };
  };

  const respond = async (state: JobSeekerAgentState) => {
    if (state.responsePayload) {
      return {
        debugTrace: appendTrace(state, "respond", "Returned prebuilt response payload."),
      };
    }

    if (state.terminationReason === "tool_error") {
      return {
        responsePayload: {
          assistantMessage:
            (state.toolResult as { message?: string } | null)?.message ??
            "The job search agent could not complete that request right now.",
          jobsPanel: null,
        } satisfies JobSeekerAgentResult,
      };
    }

    if (state.intent === "general_chat" || state.intent === "application_help" || state.intent === "unsupported") {
      let assistantMessage: string;
      let usedFallback = false;

      try {
        assistantMessage = await deps.model.composeGeneralResponse({
          attachments: state.attachments,
          intent: state.intent,
          messages: state.messages,
          profileContext: state.profileContext,
          userQuery: state.userQuery,
        });
      } catch {
        assistantMessage = getFallbackHomepageReply(state.userQuery, state.attachments);
        usedFallback = true;
      }

      return {
        debugTrace: appendTrace(state, "respond", "Generated non-search response.", {
          usedFallback,
        }),
        responsePayload: {
          assistantMessage,
          jobsPanel: null,
        } satisfies JobSeekerAgentResult,
      };
    }

    if (state.intent === "profile_or_career_id") {
      const assistantMessage = state.profileContext
        ? `Your Career ID currently points to ${[state.profileContext.headline, state.profileContext.targetRole, state.profileContext.location]
            .filter(Boolean)
            .join(" • ")}. I can use that context to rank broader job searches when you want.`
        : "I don’t have Career ID context available for this session yet, but I can still search live jobs if you tell me the kind of roles you want.";

      return {
        debugTrace: appendTrace(state, "respond", "Generated profile-focused response."),
        responsePayload: {
          assistantMessage,
          jobsPanel: null,
        } satisfies JobSeekerAgentResult,
      };
    }

    if (state.lastToolKind === "search_web" && state.lastWebSearchResult) {
      let assistantMessage: string;
      let usedFallback = false;

      try {
        assistantMessage = await deps.model.composeWebSearchResponse({
          freshness: state.routingDecision?.freshness ?? "month",
          queryUsed: state.lastWebSearchResult.query_used,
          results: state.lastWebSearchResult.results,
          userQuery: state.userQuery,
        });
      } catch {
        assistantMessage = `I couldn’t fully synthesize the live web-search results, but I did find current sources for ${state.lastWebSearchResult.query_used}.`;
        usedFallback = true;
      }

      const sources = state.lastWebSearchResult.results
        .slice(0, 3)
        .map((result) => `${result.source}: ${result.url}`)
        .join("\n");
      const groundedMessage = sources
        ? `${assistantMessage}\n\nSources:\n${sources}`
        : assistantMessage;

      return {
        debugTrace: appendTrace(state, "respond", "Generated grounded web-search response.", {
          groundedInToolResults: state.lastWebSearchResult.results.length > 0,
          queryUsed: state.lastWebSearchResult.query_used,
          usedFallback,
        }),
        responsePayload: {
          assistantMessage: groundedMessage,
          jobsPanel: null,
        } satisfies JobSeekerAgentResult,
      };
    }

    if (!state.lastSearchResult) {
      return {
        responsePayload: {
          assistantMessage: "I couldn’t build a grounded jobs response for that request.",
          jobsPanel: null,
        } satisfies JobSeekerAgentResult,
      };
    }

    const clarificationQuestion = null;
    let assistantMessage: string;
    let usedFallback = false;

    try {
      assistantMessage = await deps.model.composeSearchResponse({
        clarificationQuestion,
        jobs: state.lastSearchResult.results,
        profileContext: state.lastSearchResult.profileContext ?? state.profileContext,
        query: state.lastSearchResult.query,
        resultQuality: state.resultQuality ?? "empty",
        userQuery: state.userQuery,
      });
    } catch {
      assistantMessage = buildSearchFallbackResponse({
        clarificationQuestion,
        jobs: state.lastSearchResult.results,
        resultQuality: state.resultQuality ?? "empty",
      });
      usedFallback = true;
    }
    const jobsPanel = buildJobsPanel(state, assistantMessage, state.lastSearchResult, clarificationQuestion);

    return {
      debugTrace: appendTrace(state, "respond", "Generated grounded jobs response.", {
        jobCount: state.lastSearchResult.results.length,
        resultQuality: state.resultQuality,
        usedFallback,
      }),
      responsePayload: {
        assistantMessage,
        jobsPanel,
      } satisfies JobSeekerAgentResult,
    };
  };

  const routeAfterPlan = (state: JobSeekerAgentState) => {
    if (state.selectedTool) {
      return "execute_tool";
    }

    return "respond";
  };

  const routeAfterExecute = (state: JobSeekerAgentState) => {
    if (state.shouldTerminate) {
      return "respond";
    }

    if (state.lastToolKind === "getUserCareerProfile") {
      return "plan_next_action";
    }

    return "evaluate_tool_result";
  };

  const routeAfterEvaluate = (state: JobSeekerAgentState) => {
    if (state.shouldTerminate) {
      return "respond";
    }

    return "fallback_or_clarify";
  };

  const routeAfterFallback = (state: JobSeekerAgentState) => {
    if (state.shouldTerminate) {
      return "respond";
    }

    return "execute_tool";
  };

  const graph = new StateGraph(jobSeekerAgentStateSchema)
    .addNode("observe_context", observeContext)
    .addNode("classify_intent", classifyIntent)
    .addNode("plan_next_action", planNextAction)
    .addNode("execute_tool", executeTool)
    .addNode("evaluate_tool_result", evaluateToolResult)
    .addNode("fallback_or_clarify", fallbackOrClarify)
    .addNode("respond", respond)
    .addEdge(START, "observe_context")
    .addEdge("observe_context", "classify_intent")
    .addEdge("classify_intent", "plan_next_action")
    .addConditionalEdges("plan_next_action", routeAfterPlan, ["execute_tool", "respond"])
    .addConditionalEdges("execute_tool", routeAfterExecute, [
      "plan_next_action",
      "evaluate_tool_result",
      "respond",
    ])
    .addConditionalEdges("evaluate_tool_result", routeAfterEvaluate, [
      "fallback_or_clarify",
      "respond",
    ])
    .addConditionalEdges("fallback_or_clarify", routeAfterFallback, ["execute_tool", "respond"])
    .addEdge("respond", END)
    .compile();

  return {
    async invoke(input: JobSeekerAgentInput) {
      const initialState: JobSeekerAgentState = {
        attachments: input.attachments ?? [],
        conversationId: input.conversationId ?? null,
        debugTrace: [],
        extractedFilters: null,
        intent: null,
        intentConfidence: null,
        lastSearchResult: null,
        lastToolKind: null,
        lastWebSearchResult: null,
        loopCount: 0,
        maxLoops: 2,
        messages: input.messages,
        normalizedQuery: normalizeHumanLabel(input.userQuery),
        normalizedToolResult: null,
        ownerId: input.ownerId ?? null,
        priorJobSearchQuery: null,
        profileContext: null,
        responsePayload: null,
        resultQuality: null,
        routingDecision: null,
        selectedTool: null,
        shouldTerminate: false,
        terminationReason: null,
        toolArgs: null as JobSeekerToolInput,
        toolResult: null,
        userQuery: input.userQuery,
      };
      const result = await graph.invoke(initialState);

      return (result.responsePayload ?? {
        assistantMessage: "The job search agent could not complete that request.",
        jobsPanel: null,
      }) satisfies JobSeekerAgentResult;
    },
  };
}
