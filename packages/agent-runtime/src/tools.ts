import type {
  FunctionTool,
  ResponseFunctionToolCall,
} from "openai/resources/responses/responses";
import { z, type ZodTypeAny } from "zod";
import { traceSpan } from "@/lib/tracing";
import { searchJobsCatalog } from "@/packages/jobs-domain/src";
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

export const homepageAssistantToolRegistry = createAgentToolRegistry([searchJobsTool]);
