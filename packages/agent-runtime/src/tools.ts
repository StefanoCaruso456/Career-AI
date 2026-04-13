import type {
  FunctionTool,
  ResponseFunctionToolCall,
} from "openai/resources/responses/responses";
import { z, type ZodTypeAny } from "zod";
import { traceSpan } from "@/lib/tracing";
import { searchJobsCatalog } from "@/packages/jobs-domain/src";
import {
  findPersistentContextByTalentIdentityId,
  findPersistentRecruiterCandidateProjectionByLookup,
  findPersistentSharedRecruiterCandidateProjectionByLookup,
  getPersistentCareerBuilderProfile,
  listPersistentCareerBuilderEvidence,
  type PersistentRecruiterCandidateProjection,
} from "@/packages/persistence/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import type { AgentContext } from "./context";

type AgentToolTraceOptions<TResult> = {
  output?: (result: TResult) => unknown;
  tags?: string[];
};

type AnyAgentToolDefinition = {
  description: string;
  execute: (args: {
    agentContext: AgentContext;
    input: any;
  }) => Promise<any> | any;
  inputSchema: ZodTypeAny;
  isAuthorized?: (args: {
    agentContext: AgentContext;
    input: any;
  }) => Promise<boolean> | boolean;
  name: string;
  trace?: AgentToolTraceOptions<any>;
};

export type AgentToolDefinition<
  TInputSchema extends ZodTypeAny = ZodTypeAny,
  TResult = unknown,
> = {
  description: string;
  execute: (args: {
    agentContext: AgentContext;
    input: z.output<TInputSchema>;
  }) => Promise<TResult> | TResult;
  inputSchema: TInputSchema;
  isAuthorized?: (args: {
    agentContext: AgentContext;
    input: z.output<TInputSchema>;
  }) => Promise<boolean> | boolean;
  name: string;
  trace?: AgentToolTraceOptions<TResult>;
};

export class AgentToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolInputError";
  }
}

export class AgentToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not registered.`);
    this.name = "AgentToolNotFoundError";
  }
}

export class AgentToolPermissionError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not allowed for this actor.`);
    this.name = "AgentToolPermissionError";
  }
}

export type AgentToolRegistry = Record<string, AnyAgentToolDefinition>;
type RecruiterVisibility = "limited" | "private" | "searchable";

const EMPLOYMENT_EVIDENCE_TEMPLATES = new Set([
  "offer-letters",
  "employment-history-reports",
  "promotion-letters",
  "company-letters",
  "hr-official-letters",
]);
const RECRUITER_ROLE_TYPES = new Set(["recruiter", "hiring_manager"]);

export const searchJobsToolInputSchema = z.object({
  limit: z.number().int().positive().max(8).default(5),
  location: z.string().trim().min(1).nullable().optional().default(null),
  query: z.string().trim().min(1),
});

const normalizedJobSummarySchema = z.object({
  applyUrl: z.string().url(),
  companyName: z.string(),
  id: z.string(),
  location: z.string().nullable(),
  postedAt: z.string().datetime().nullable(),
  salaryText: z.string().nullable(),
  sourceLabel: z.string(),
  summary: z.string(),
  title: z.string(),
  workplaceType: z.string().nullable(),
});

const searchJobsToolOutputSchema = z.object({
  jobs: z.array(normalizedJobSummarySchema),
  location: z.string().nullable(),
  query: z.string(),
  totalResults: z.number().int().nonnegative(),
});

export const getCareerIdSummaryToolInputSchema = z.object({
  lookup: z.string().trim().min(1).nullable().optional().default(null),
});

const safeCandidateSummarySchema = z.object({
  candidateId: z.string(),
  careerId: z.string(),
  credibilityLabel: z.string().nullable(),
  credibilityScore: z.number().int().min(0).max(100).nullable(),
  displayName: z.string(),
  hasPublicShareProfile: z.boolean(),
  headline: z.string().nullable(),
  location: z.string().nullable(),
  profileSummary: z.string().nullable(),
  targetRole: z.string().nullable(),
  topSkills: z.array(z.string()).default([]),
  verifiedExperienceCount: z.number().int().nonnegative().nullable(),
});

const recruiterVisibilitySchema = z.enum(["searchable", "limited", "private"]);

const careerIdSummarySchema = safeCandidateSummarySchema.extend({
  evidenceCount: z.number().int().nonnegative().nullable(),
  profileCompletionPercent: z.number().int().nonnegative().nullable(),
  recruiterVisibility: recruiterVisibilitySchema.nullable(),
  roleType: z.string().nullable(),
  searchable: z.boolean(),
});

const getCareerIdSummaryToolOutputSchema = z.object({
  found: z.boolean(),
  subject: z.enum(["self", "shared"]),
  summary: careerIdSummarySchema.nullable(),
});

export const searchCandidatesToolInputSchema = z.object({
  limit: z.number().int().positive().max(8).default(5),
  query: z.string().trim().min(1),
});

const searchCandidatesToolOutputSchema = z.object({
  candidates: z.array(safeCandidateSummarySchema),
  query: z.string(),
  totalResults: z.number().int().nonnegative(),
});

function buildSearchPrompt(input: z.output<typeof searchJobsToolInputSchema>) {
  if (input.location) {
    return `${input.query} in ${input.location}`;
  }

  return input.query;
}

function buildJobSummary(job: {
  companyName: string;
  descriptionSnippet?: string | null;
  location: string | null;
  matchSummary?: string;
  salaryText?: string | null;
  title: string;
  workplaceType?: string;
}) {
  const normalizedDescription = job.descriptionSnippet?.trim();

  if (normalizedDescription) {
    return normalizedDescription;
  }

  if (job.matchSummary?.trim()) {
    return job.matchSummary.trim();
  }

  return [
    `${job.title} at ${job.companyName}`,
    job.location,
    job.workplaceType ?? null,
    job.salaryText ?? null,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join(" • ");
}

function parseToolArguments(rawArguments: string) {
  try {
    return JSON.parse(rawArguments);
  } catch {
    throw new AgentToolInputError("The tool arguments must be valid JSON.");
  }
}

function normalizeText(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized ? normalized : null;
}

function normalizeRecruiterVisibility(value: unknown): RecruiterVisibility | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (normalized === "searchable" || normalized === "limited" || normalized === "private") {
    return normalized;
  }

  return null;
}

function getCredibilityLabel(score: number | null) {
  if (score === null) {
    return null;
  }

  if (score >= 76) {
    return "High credibility";
  }

  if (score >= 56) {
    return "Evidence-backed";
  }

  return "Growing profile";
}

function isRecruiterRole(roleType: string | null | undefined) {
  return roleType ? RECRUITER_ROLE_TYPES.has(roleType.trim().toLowerCase()) : false;
}

function buildSelfCredibilityScore(args: {
  allowPublicShareLink: boolean;
  evidenceCount: number;
  hasStructuredProfile: boolean;
  profileCompletionPercent: number;
  showEmploymentRecords: boolean;
  verifiedExperienceCount: number;
}) {
  const score = Math.min(
    1,
    Math.min(args.profileCompletionPercent / 100, 1) * 0.46 +
      Math.min(args.evidenceCount, 5) * 0.08 +
      Math.min(args.verifiedExperienceCount, 3) * 0.13 +
      (args.hasStructuredProfile ? 0.12 : 0) +
      (args.showEmploymentRecords ? 0.05 : 0) +
      (args.allowPublicShareLink ? 0.04 : 0),
  );

  return Math.round(score * 100);
}

function toProjectionCandidateSummary(args: {
  projection: PersistentRecruiterCandidateProjection;
}) {
  return safeCandidateSummarySchema.parse({
    candidateId: args.projection.candidateId,
    careerId: args.projection.careerId,
    credibilityLabel: getCredibilityLabel(Math.round(args.projection.credibilityScore * 100)),
    credibilityScore: Math.round(args.projection.credibilityScore * 100),
    displayName: args.projection.fullName,
    hasPublicShareProfile: Boolean(
      args.projection.publicShareToken || args.projection.shareProfileId,
    ),
    headline: args.projection.headline,
    location: args.projection.location,
    profileSummary: args.projection.profileSummary,
    targetRole: args.projection.targetRole,
    topSkills: args.projection.displaySkills,
    verifiedExperienceCount: args.projection.verifiedExperienceCount,
  });
}

function toProjectionCareerIdSummary(args: {
  projection: PersistentRecruiterCandidateProjection;
  roleType?: string | null;
}) {
  return careerIdSummarySchema.parse({
    ...toProjectionCandidateSummary({
      projection: args.projection,
    }),
    evidenceCount: args.projection.evidenceCount,
    profileCompletionPercent: null,
    recruiterVisibility: args.projection.recruiterVisibility,
    roleType: args.roleType ?? null,
    searchable: args.projection.searchable,
  });
}

function toCandidateSearchSummaryFromMatch(args: {
  match: {
    actions: {
      trustProfileUrl: string | null;
    };
    candidateId: string;
    careerId: string;
    credibility: {
      label: string;
      score: number;
      verifiedExperienceCount: number;
    };
    fullName: string;
    headline: string | null;
    location: string | null;
    profileSummary: string | null;
    targetRole: string | null;
    topSkills: string[];
  };
}) {
  return safeCandidateSummarySchema.parse({
    candidateId: args.match.candidateId,
    careerId: args.match.careerId,
    credibilityLabel: args.match.credibility.label,
    credibilityScore: Math.round(args.match.credibility.score),
    displayName: args.match.fullName,
    hasPublicShareProfile: Boolean(args.match.actions.trustProfileUrl),
    headline: args.match.headline,
    location: args.match.location,
    profileSummary: args.match.profileSummary,
    targetRole: args.match.targetRole,
    topSkills: args.match.topSkills,
    verifiedExperienceCount: args.match.credibility.verifiedExperienceCount,
  });
}

function getCompletedEvidenceCount(
  evidence: Array<{
    status: string;
  }>,
) {
  return evidence.filter((record) => record.status === "COMPLETE").length;
}

function getVerifiedExperienceCount(
  evidence: Array<{
    status: string;
    templateId: string;
  }>,
) {
  return evidence.filter(
    (record) =>
      record.status === "COMPLETE" &&
      EMPLOYMENT_EVIDENCE_TEMPLATES.has(record.templateId),
  ).length;
}

async function resolveSharedOrPublicProjection(lookup: string) {
  const publicProjection = await findPersistentRecruiterCandidateProjectionByLookup({
    lookup,
  });

  if (publicProjection) {
    return publicProjection;
  }

  return findPersistentSharedRecruiterCandidateProjectionByLookup({
    lookup,
  });
}

async function buildSelfCareerIdSummary(agentContext: AgentContext) {
  if (
    agentContext.actor.kind !== "authenticated_user" ||
    !agentContext.actor.talentIdentityId
  ) {
    return getCareerIdSummaryToolOutputSchema.parse({
      found: false,
      subject: "self",
      summary: null,
    });
  }

  const talentIdentityId = agentContext.actor.talentIdentityId;
  const context = await findPersistentContextByTalentIdentityId({
    correlationId: agentContext.run.correlationId,
    talentIdentityId,
  });
  const profile = await getPersistentCareerBuilderProfile({
    careerIdentityId: talentIdentityId,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const evidence = await listPersistentCareerBuilderEvidence({
    careerIdentityId: talentIdentityId,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const onboardingProfile =
    typeof context.onboarding.profile === "object" &&
    context.onboarding.profile !== null
      ? context.onboarding.profile
      : {};
  const recruiterVisibility = normalizeRecruiterVisibility(
    Reflect.get(onboardingProfile, "recruiterVisibility"),
  );
  const headline =
    profile?.careerHeadline ??
    normalizeText(
      typeof Reflect.get(onboardingProfile, "headline") === "string"
        ? String(Reflect.get(onboardingProfile, "headline"))
        : null,
    );
  const targetRole = profile?.targetRole ?? null;
  const location =
    profile?.location ??
    normalizeText(
      typeof Reflect.get(onboardingProfile, "location") === "string"
        ? String(Reflect.get(onboardingProfile, "location"))
        : null,
    );
  const profileSummary =
    profile?.coreNarrative ??
    normalizeText(
      typeof Reflect.get(onboardingProfile, "intent") === "string"
        ? String(Reflect.get(onboardingProfile, "intent"))
        : null,
    );
  const evidenceCount = getCompletedEvidenceCount(evidence);
  const verifiedExperienceCount = getVerifiedExperienceCount(evidence);
  const credibilityScore = buildSelfCredibilityScore({
    allowPublicShareLink: context.aggregate.privacySettings.allow_public_share_link,
    evidenceCount,
    hasStructuredProfile: Boolean(headline || targetRole || location || profileSummary),
    profileCompletionPercent: context.onboarding.profileCompletionPercent,
    showEmploymentRecords: context.aggregate.privacySettings.show_employment_records,
    verifiedExperienceCount,
  });

  return getCareerIdSummaryToolOutputSchema.parse({
    found: true,
    subject: "self",
    summary: {
      candidateId: context.aggregate.talentIdentity.id,
      careerId: context.aggregate.talentIdentity.talent_agent_id,
      credibilityLabel: getCredibilityLabel(credibilityScore),
      credibilityScore,
      displayName: context.aggregate.talentIdentity.display_name,
      evidenceCount,
      hasPublicShareProfile: Boolean(
        context.aggregate.privacySettings.allow_public_share_link &&
          context.aggregate.soulRecord.default_share_profile_id,
      ),
      headline,
      location,
      profileCompletionPercent: context.onboarding.profileCompletionPercent,
      profileSummary,
      recruiterVisibility,
      roleType: context.onboarding.roleType,
      searchable:
        recruiterVisibility !== "private" &&
        Boolean(headline || targetRole || location || profileSummary),
      targetRole,
      topSkills: [],
      verifiedExperienceCount,
    },
  });
}

async function buildLookupCareerIdSummary(lookup: string) {
  const projection = await resolveSharedOrPublicProjection(lookup);

  return getCareerIdSummaryToolOutputSchema.parse({
    found: Boolean(projection),
    subject: "shared",
    summary: projection
      ? toProjectionCareerIdSummary({
          projection,
        })
      : null,
  });
}

export function createAgentToolRegistry<TTools extends AnyAgentToolDefinition[]>(
  tools: TTools,
): AgentToolRegistry {
  return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

export function listAgentToolsAsOpenAIFunctions(
  registry: AgentToolRegistry,
): FunctionTool[] {
  return Object.values(registry).map((tool) => ({
    description: tool.description,
    name: tool.name,
    parameters: z.toJSONSchema(tool.inputSchema),
    strict: true,
    type: "function",
  }));
}

export async function executeAgentToolCall<TResult = unknown>(args: {
  agentContext: AgentContext;
  registry: AgentToolRegistry;
  toolCall: Pick<ResponseFunctionToolCall, "arguments" | "name">;
}) {
  const tool = args.registry[args.toolCall.name];

  if (!tool) {
    throw new AgentToolNotFoundError(args.toolCall.name);
  }

  const parsedArguments = parseToolArguments(args.toolCall.arguments);

  return traceSpan(
    {
      input: {
        arguments: parsedArguments,
        tool_name: tool.name,
      },
      name: `tool.${tool.name}.execute`,
      output:
        typeof tool.trace?.output === "function"
          ? (result: TResult) => tool.trace?.output?.(result)
          : undefined,
      tags: [`tool:${tool.name}`, ...(tool.trace?.tags ?? [])],
      type: "function",
    },
    async () => {
      const input = tool.inputSchema.safeParse(parsedArguments);

      if (!input.success) {
        throw new AgentToolInputError(input.error.issues[0]?.message ?? "Invalid tool arguments.");
      }

      const authorized = await tool.isAuthorized?.({
        agentContext: args.agentContext,
        input: input.data,
      });

      if (authorized === false) {
        throw new AgentToolPermissionError(tool.name);
      }

      return tool.execute({
        agentContext: args.agentContext,
        input: input.data,
      }) as Promise<TResult> | TResult;
    },
  );
}

export const searchJobsTool: AgentToolDefinition<
  typeof searchJobsToolInputSchema,
  z.infer<typeof searchJobsToolOutputSchema>
> = {
  description:
    "Search live jobs in the current catalog using a short query and optional location filter.",
  execute: async ({
    agentContext,
    input,
  }: {
    agentContext: AgentContext;
    input: z.output<typeof searchJobsToolInputSchema>;
  }) => {
    const result = await searchJobsCatalog({
      limit: input.limit,
      origin: "chat_prompt",
      ownerId: agentContext.ownerId,
      prompt: buildSearchPrompt(input),
      refresh: false,
    });

    return searchJobsToolOutputSchema.parse({
      jobs: result.results.slice(0, input.limit).map((job) => ({
        applyUrl: job.applyUrl,
        companyName: job.companyName,
        id: job.id,
        location: job.location,
        postedAt: job.postedAt ?? null,
        salaryText: job.salaryText ?? null,
        sourceLabel: job.sourceLabel,
        summary: buildJobSummary(job),
        title: job.title,
        workplaceType: job.workplaceType ?? null,
      })),
      location: input.location ?? null,
      query: input.query,
      totalResults: result.totalCandidateCount,
    });
  },
  inputSchema: searchJobsToolInputSchema,
  isAuthorized: () => true,
  name: "search_jobs",
  trace: {
    output: (result: z.infer<typeof searchJobsToolOutputSchema>) => ({
      job_count: result.jobs.length,
      total_results: result.totalResults,
    }),
    tags: ["workflow:homepage_assistant"],
  },
};

export const getCareerIdSummaryTool: AgentToolDefinition<
  typeof getCareerIdSummaryToolInputSchema,
  z.infer<typeof getCareerIdSummaryToolOutputSchema>
> = {
  description:
    "Return a safe structured Career ID summary for the signed-in user, or for an exact public/shared profile lookup.",
  execute: async ({
    agentContext,
    input,
  }: {
    agentContext: AgentContext;
    input: z.output<typeof getCareerIdSummaryToolInputSchema>;
  }) => {
    const lookup = normalizeText(input.lookup);

    if (!lookup) {
      return buildSelfCareerIdSummary(agentContext);
    }

    const selfSummary =
      agentContext.actor.kind === "authenticated_user" &&
      agentContext.actor.talentIdentityId
        ? await buildSelfCareerIdSummary(agentContext)
        : null;

    if (
      selfSummary?.found &&
      selfSummary.summary &&
      (lookup.toLowerCase() === selfSummary.summary.candidateId.toLowerCase() ||
        lookup.toUpperCase() === selfSummary.summary.careerId.toUpperCase())
    ) {
      return selfSummary;
    }

    return buildLookupCareerIdSummary(lookup);
  },
  inputSchema: getCareerIdSummaryToolInputSchema,
  isAuthorized: ({ agentContext, input }) =>
    agentContext.actor.kind !== "guest_user" &&
    (Boolean(normalizeText(input.lookup)) || agentContext.actor.kind === "authenticated_user"),
  name: "get_career_id_summary",
  trace: {
    output: (result: z.infer<typeof getCareerIdSummaryToolOutputSchema>) => ({
      found: result.found,
      subject: result.subject,
    }),
    tags: ["workflow:homepage_assistant"],
  },
};

export const searchCandidatesTool: AgentToolDefinition<
  typeof searchCandidatesToolInputSchema,
  z.infer<typeof searchCandidatesToolOutputSchema>
> = {
  description:
    "Search only public candidate summaries and explicit shared profiles for recruiter-safe candidate sourcing.",
  execute: async ({
    input,
  }: {
    agentContext: AgentContext;
    input: z.output<typeof searchCandidatesToolInputSchema>;
  }) => {
    const searchResult = await searchEmployerCandidates({
      limit: input.limit,
      prompt: input.query,
    });
    const visibleCandidates = searchResult.candidates.map((match) =>
      toCandidateSearchSummaryFromMatch({
        match,
      }),
    );

    if (visibleCandidates.length > 0) {
      return searchCandidatesToolOutputSchema.parse({
        candidates: visibleCandidates,
        query: input.query,
        totalResults: searchResult.totalMatches,
      });
    }

    const sharedProjection = await findPersistentSharedRecruiterCandidateProjectionByLookup({
      lookup: input.query,
    });

    return searchCandidatesToolOutputSchema.parse({
      candidates: sharedProjection
        ? [
            toProjectionCandidateSummary({
              projection: sharedProjection,
            }),
          ]
        : [],
      query: input.query,
      totalResults: sharedProjection ? 1 : 0,
    });
  },
  inputSchema: searchCandidatesToolInputSchema,
  isAuthorized: ({ agentContext }) => isRecruiterRole(agentContext.roleType),
  name: "search_candidates",
  trace: {
    output: (result: z.infer<typeof searchCandidatesToolOutputSchema>) => ({
      candidate_count: result.candidates.length,
      total_results: result.totalResults,
    }),
    tags: ["workflow:homepage_assistant"],
  },
};

export const homepageAssistantToolRegistry = createAgentToolRegistry([
  searchJobsTool,
  getCareerIdSummaryTool,
  searchCandidatesTool,
]);
