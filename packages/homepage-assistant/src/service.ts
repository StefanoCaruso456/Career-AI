import type { ResponseInput } from "openai/resources/responses/responses";
import { getOpenAIClient as getSharedOpenAIClient } from "@/lib/braintrust";
import { buildOpenAIResponseMetrics } from "@/lib/braintrust-metrics";
import { traceSpan } from "@/lib/tracing";
import {
  buildAgentModelContext,
  runBoundedAgentOrchestration,
  type AgentContext,
  type AgentConversationMessage,
  type AgentOrchestrationConfig,
  type AgentOrchestrationToolCall,
} from "@/packages/agent-runtime/src";
import {
  AgentToolInputError,
  AgentToolPermissionError,
  filterAgentToolRegistry,
  getAgentToolDefinition,
  type AgentToolRegistry,
  executeAgentToolCall,
  homepageAssistantToolRegistry,
  listAgentToolsAsOpenAIFunctions,
} from "@/packages/agent-runtime/src/tools";
import type { InternalAgentStopReason } from "@/packages/contracts/src";
import { getFallbackHomepageReply, getMatchedHomepageReply } from "./fallback";

const homepageInstructions =
  "You are the homepage assistant for Career AI. Ground every answer in the truth available in the user's request, product context, and tool results. Do not guess, exaggerate, or imply verification that is not actually stated. Focus on hiring verification, candidate identity, recruiter trust, and product workflows. When users ask what the agent does, explain that it turns their Career ID into a recruiter-ready trust layer by referencing identity, work history, education, and supporting proof so HR teams and recruiters can understand the candidate, ask better questions, and trust what they see faster. When users ask how Career AI helps them get hired faster, begin with one concise sentence that explains they can apply to curated roles here, use Easy Apply across hundreds of jobs, and move through direct company hiring pipelines faster when their Career ID is ready. Do not claim a company partnership unless the available context or tool results explicitly support that claim. Use available tools for live jobs, Career ID summaries, and public/shared candidate lookups instead of guessing. Organize every answer in three parts: first give a short explanation paragraph, then add flat bullet points with the most important supporting details, then end with a brief 'Next steps' suggestion tailored to the user. Keep answers clear, direct, and well structured.";

export type HomepageAssistantAttachment = {
  mimeType: string;
  name: string;
  size: number;
};

export type HomepageAssistantRuntimeMode = "bounded_loop" | "single_round";

export type HomepageAssistantReplyResult = {
  source:
    | "matched_reply"
    | "starter_tool_reply"
    | "missing_openai_api_key_fallback"
    | "openai_bounded_loop"
    | "openai_empty_fallback"
    | "openai_error_fallback"
    | "openai_single_round";
  stepsUsed: number;
  stopReason: InternalAgentStopReason;
  text: string;
  toolCallsUsed: number;
};

type HomepageAssistantReplyOptions = {
  agentContext?: AgentContext | null;
  contextPreamble?: string | null;
  conversationMessages?: AgentConversationMessage[] | null;
  instructions?: string;
  loopConfig?: Partial<AgentOrchestrationConfig>;
  runtimeMode?: HomepageAssistantRuntimeMode;
  starterActionId?: string | null;
  toolRegistry?: AgentToolRegistry | null;
  workflowId?: string;
};

type HomepageOpenAIInput = ResponseInput | string;

const deterministicStarterActionIds = [
  "job_seeker_hired_faster",
  "job_seeker_secure_identity",
  "job_seeker_agent_explainer",
  "job_seeker_resume_builder_difference",
] as const;

type DeterministicStarterActionId = (typeof deterministicStarterActionIds)[number];

type CareerSummarySnapshot = {
  credibilityLabel: string | null;
  evidenceCount: number | null;
  profileCompletionPercent: number | null;
  recruiterVisibility: string | null;
  searchable: boolean | null;
  targetRole: string | null;
};

export class OpenAIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIConfigError";
  }
}

export class OpenAIResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIResponseError";
  }
}

function getHomepageOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIConfigError("The server is missing OPENAI_API_KEY.");
  }

  return getSharedOpenAIClient(apiKey);
}

function getModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5";
}

function getTranscriptionModel() {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe";
}

function isBoundedAgentLoopEnabled() {
  const configuredValue = process.env.CAREER_AI_ENABLE_BOUNDED_AGENT_LOOP?.trim().toLowerCase();

  return configuredValue === "1" || configuredValue === "true";
}

function resolveRuntimeMode(
  requestedMode?: HomepageAssistantRuntimeMode,
): HomepageAssistantRuntimeMode {
  if (requestedMode) {
    return requestedMode;
  }

  return isBoundedAgentLoopEnabled() ? "bounded_loop" : "single_round";
}

function getEffectiveWorkflowId(workflowId?: string) {
  return workflowId?.trim() || "homepage_assistant";
}

function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function buildAssistantInput(message: string, attachments: HomepageAssistantAttachment[]) {
  if (attachments.length === 0) {
    return message;
  }

  const normalizedMessage = message.trim();
  const attachmentSummary = attachments
    .map(
      (attachment) =>
        `- ${attachment.name} (${attachment.mimeType || "application/octet-stream"}, ${formatAttachmentSize(attachment.size)})`,
    )
    .join("\n");

  return [
    normalizedMessage || "The user attached supporting files and wants help with them.",
    "",
    "Attached files:",
    attachmentSummary,
    "",
    "You can acknowledge attached files by name and type, but do not claim to have parsed their contents unless the user provided those contents in text.",
  ].join("\n");
}

function buildHomepageModelInput(args: {
  agentContext?: AgentContext | null;
  attachments: HomepageAssistantAttachment[];
  contextPreamble?: string | null;
  message: string;
  messages?: AgentConversationMessage[] | null;
}) {
  const baseInput = buildAssistantInput(args.message, args.attachments);
  const modelContext = buildAgentModelContext({
    agentContext: args.agentContext,
    currentMessage: args.message,
    messages: args.messages,
  });
  const contextPreamble = args.contextPreamble?.trim() ?? "";

  if (!modelContext && !contextPreamble) {
    return baseInput;
  }

  return [modelContext, contextPreamble]
    .filter((section): section is string => Boolean(section))
    .concat(["", "Current user request:", baseInput])
    .join("\n");
}

function buildReplyPreview(reply: string) {
  return reply.slice(0, 160);
}

function getOpenAIErrorMetadata(error: unknown) {
  if (error instanceof Error) {
    return {
      error_message: error.message,
      error_type: error.name,
    };
  }

  return {
    error_message: String(error),
    error_type: typeof error,
  };
}

function getAgentContextMetadata(agentContext?: AgentContext | null) {
  if (!agentContext) {
    return undefined;
  }

  return {
    actor_kind: agentContext.actor.kind,
    organization_id: agentContext.organizationContext?.primaryOrganization?.organizationId ?? null,
    organization_membership_count: agentContext.organizationContext?.activeMembershipCount ?? 0,
    organization_role: agentContext.organizationContext?.primaryOrganization?.role ?? null,
    preferred_persona: agentContext.preferredPersona,
    role_type: agentContext.roleType,
    run_id: agentContext.run.runId,
  };
}

function getTraceMetadata(args: {
  agentContext?: AgentContext | null;
  provider?: "openai";
  workflowId?: string;
}) {
  return {
    ...(args.provider ? { provider: args.provider } : {}),
    ...getAgentContextMetadata(args.agentContext),
    prompt_version: `${getEffectiveWorkflowId(args.workflowId)}.v1`,
    workflow_id: `${getEffectiveWorkflowId(args.workflowId)}.reply`,
  };
}

function getEffectiveToolRegistry(
  toolRegistry?: AgentToolRegistry | null,
) {
  return toolRegistry ?? homepageAssistantToolRegistry;
}

function normalizeStarterActionId(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized ? normalized : null;
}

function asDeterministicStarterActionId(
  value: string | null | undefined,
): DeterministicStarterActionId | null {
  const normalized = normalizeStarterActionId(value);

  if (!normalized) {
    return null;
  }

  return deterministicStarterActionIds.find((candidate) => candidate === normalized) ?? null;
}

function isKnownToolErrorOutput(
  value: unknown,
): value is {
  error: { code: string; message: string };
  ok: false;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === false &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "code" in value.error &&
    typeof value.error.code === "string" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  );
}

function readCareerSummarySnapshot(value: unknown): CareerSummarySnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as {
    found?: unknown;
    summary?: unknown;
  };

  if (record.found !== true || typeof record.summary !== "object" || record.summary === null) {
    return null;
  }

  const summary = record.summary as Record<string, unknown>;

  return {
    credibilityLabel:
      typeof summary.credibilityLabel === "string" ? summary.credibilityLabel : null,
    evidenceCount:
      typeof summary.evidenceCount === "number" ? Math.round(summary.evidenceCount) : null,
    profileCompletionPercent:
      typeof summary.profileCompletionPercent === "number"
        ? Math.round(summary.profileCompletionPercent)
        : null,
    recruiterVisibility:
      typeof summary.recruiterVisibility === "string" ? summary.recruiterVisibility : null,
    searchable: typeof summary.searchable === "boolean" ? summary.searchable : null,
    targetRole: typeof summary.targetRole === "string" ? summary.targetRole : null,
  };
}

function buildOverviewBulletsSummaryReply(args: {
  bullets: string[];
  overview: string;
  summary: string;
}) {
  return [
    `Overview: ${args.overview}`,
    "",
    ...args.bullets.map((bullet) => `- ${bullet}`),
    "",
    `Summary: ${args.summary}`,
  ].join("\n");
}

function buildCareerSnapshotBullet(args: {
  snapshot: CareerSummarySnapshot | null;
  toolErrorMessage: string | null;
}) {
  if (args.snapshot) {
    const completion =
      args.snapshot.profileCompletionPercent !== null
        ? `${args.snapshot.profileCompletionPercent}% profile completion`
        : "profile completion not yet measured";
    const evidence =
      args.snapshot.evidenceCount !== null
        ? `${args.snapshot.evidenceCount} completed evidence records`
        : "evidence count not yet available";
    const role =
      args.snapshot.targetRole !== null
        ? `target role set to ${args.snapshot.targetRole}`
        : "target role not set yet";

    return `Current Career ID signal: ${completion}, ${evidence}, and ${role}.`;
  }

  if (args.toolErrorMessage) {
    return `I attempted to load your Career ID snapshot, but it was unavailable in this request (${args.toolErrorMessage}).`;
  }

  return "I could not find a complete Career ID snapshot in this request, so this guidance stays platform-level.";
}

function buildVisibilityBullet(snapshot: CareerSummarySnapshot | null) {
  if (!snapshot) {
    return "Keep sharing explicit and permission-based so recruiters only see what you intend to expose.";
  }

  if (snapshot.recruiterVisibility) {
    return `Recruiter visibility is currently set to ${snapshot.recruiterVisibility}, which controls how broadly your profile can be discovered.`;
  }

  if (snapshot.searchable === false) {
    return "Your profile is currently not searchable, so discovery may be limited until visibility settings are updated.";
  }

  return "Use visibility controls deliberately so your profile is discoverable where you want it and private where you do not.";
}

function buildDeterministicStarterReply(args: {
  snapshot: CareerSummarySnapshot | null;
  starterActionId: DeterministicStarterActionId;
  toolErrorMessage: string | null;
}) {
  const careerSnapshotBullet = buildCareerSnapshotBullet({
    snapshot: args.snapshot,
    toolErrorMessage: args.toolErrorMessage,
  });

  if (args.starterActionId === "job_seeker_hired_faster") {
    return buildOverviewBulletsSummaryReply({
      overview:
        "You can get hired faster by combining a stronger Career ID trust signal with targeted applications, so recruiters can evaluate you with less back-and-forth.",
      bullets: [
        careerSnapshotBullet,
        "Prioritize proof for identity, recent work history, and role-relevant outcomes before broad outreach.",
        "Use Find NEW Jobs for live role discovery; this starter response is focused on profile readiness, not job retrieval.",
      ],
      summary:
        "Fastest path: strengthen your highest-impact proof first, then apply to targeted openings with a clearer trust profile.",
    });
  }

  if (args.starterActionId === "job_seeker_secure_identity") {
    return buildOverviewBulletsSummaryReply({
      overview:
        "Career AI is a secure career identity platform because it is designed around permission-based sharing and evidence-backed profile context instead of disconnected documents.",
      bullets: [
        careerSnapshotBullet,
        buildVisibilityBullet(args.snapshot),
        "Security here is operational: sharing boundaries, verification context, and provenance stay attached to what is shown.",
      ],
      summary:
        "Security in this workflow comes from explicit sharing control plus attached verification context, not from document upload alone.",
    });
  }

  if (args.starterActionId === "job_seeker_agent_explainer") {
    return buildOverviewBulletsSummaryReply({
      overview:
        "The agent turns your Career ID into recruiter-readable guidance by using tools to ground responses in profile and platform data rather than guessing.",
      bullets: [
        careerSnapshotBullet,
        "It explains verification context clearly so hiring teams can distinguish backed signals from incomplete claims.",
        "It can support workflows such as profile guidance and job discovery, while keeping each action path explicit.",
      ],
      summary:
        "The agent's job is to make your career signal legible, grounded, and actionable for hiring workflows.",
    });
  }

  return buildOverviewBulletsSummaryReply({
    overview:
      "A resume builder formats your story, while Career AI is designed to connect that story to persistent identity and evidence-backed trust context.",
    bullets: [
      careerSnapshotBullet,
      "Resumes are presentation artifacts; Career ID is an evolving trust surface with explicit verification context.",
      buildVisibilityBullet(args.snapshot),
    ],
    summary:
      "Use a resume to present your narrative and Career ID to support that narrative with durable, permissioned proof context.",
  });
}

async function runDeterministicStarterActionReply(args: {
  agentContext?: AgentContext | null;
  starterActionId?: string | null;
  toolRegistry?: AgentToolRegistry | null;
}) {
  const starterActionId = asDeterministicStarterActionId(args.starterActionId);

  if (!starterActionId) {
    return null;
  }

  let snapshot: CareerSummarySnapshot | null = null;
  let toolCallsUsed = 0;
  let toolErrorMessage: string | null = null;

  if (args.agentContext) {
    toolCallsUsed = 1;

    try {
      const toolOutput = await executeHomepageTool({
        agentContext: args.agentContext,
        registry: getEffectiveToolRegistry(args.toolRegistry),
        toolCall: {
          arguments: JSON.stringify({ lookup: null }),
          callId: null,
          name: "get_career_id_summary",
          sideEffect: "read",
        },
      });

      if (isKnownToolErrorOutput(toolOutput)) {
        toolErrorMessage = toolOutput.error.message;
      } else {
        snapshot = readCareerSummarySnapshot(toolOutput);
      }
    } catch (error) {
      toolErrorMessage = error instanceof Error ? error.message : "tool execution failed";
    }
  } else {
    toolErrorMessage = "missing session context";
  }

  return {
    source: "starter_tool_reply" as const,
    stepsUsed: 1,
    stopReason: "completed" as const,
    text: buildDeterministicStarterReply({
      snapshot,
      starterActionId,
      toolErrorMessage,
    }),
    toolCallsUsed,
  };
}

function buildToolDefinitions(
  agentContext?: AgentContext | null,
  toolRegistry?: AgentToolRegistry | null,
) {
  if (!agentContext) {
    return [];
  }

  return listAgentToolsAsOpenAIFunctions(getEffectiveToolRegistry(toolRegistry));
}

async function createOpenAIResponse(args: {
  agentContext?: AgentContext | null;
  input: HomepageOpenAIInput;
  instructions: string;
  name: string;
  previousResponseId?: string | null;
  tags?: string[];
  toolRegistry?: AgentToolRegistry | null;
  toolName?: string | null;
  workflowId?: string;
}) {
  const startedAtMs = Date.now();
  let endedAtMs = startedAtMs;
  const tools = buildToolDefinitions(args.agentContext, args.toolRegistry);

  return traceSpan(
    {
      input: {
        input: args.input,
        instructions: args.instructions,
        model: getModel(),
        previous_response_id: args.previousResponseId ?? null,
        tool_count: tools.length,
        tool_name: args.toolName ?? null,
      },
      metadata: {
        ...getTraceMetadata({
          agentContext: args.agentContext,
          provider: "openai",
          workflowId: args.workflowId,
        }),
        model_name: getModel(),
      },
      metrics: (openAIResponse: {
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
      }) =>
        buildOpenAIResponseMetrics(openAIResponse.usage, {
          endedAtMs,
          startedAtMs,
        }),
      name: args.name,
      output: (openAIResponse: {
        output_text?: string | null;
      }) => {
        const output = openAIResponse.output_text?.trim() ?? "";

        return {
          model: getModel(),
          output_preview: buildReplyPreview(output),
          output_text_length: output.length,
          provider: "openai",
          tool_name: args.toolName ?? null,
        };
      },
      tags: ["provider:openai", ...(args.tags ?? [])],
      type: "llm",
    },
    async () => {
      const openAIResponse = await getHomepageOpenAIClient().responses.create({
        ...(tools.length > 0 ? { tools } : {}),
        input: args.input,
        instructions: args.instructions,
        model: getModel(),
        ...(args.previousResponseId ? { previous_response_id: args.previousResponseId } : {}),
        store: false,
      });

      endedAtMs = Date.now();
      return openAIResponse;
    },
  );
}

function extractSingleFunctionToolCall(response: { output?: unknown[] | null }) {
  const toolCalls =
    response.output?.filter(
      (item): item is { arguments: string; call_id: string; name: string; type: "function_call" } =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "function_call" &&
        "arguments" in item &&
        typeof item.arguments === "string" &&
        "call_id" in item &&
        typeof item.call_id === "string" &&
        "name" in item &&
        typeof item.name === "string",
    ) ?? [];

  if (toolCalls.length === 0) {
    return null;
  }

  if (toolCalls.length > 1) {
    throw new OpenAIResponseError(
      "Homepage assistant only supports one function tool call per response.",
    );
  }

  return toolCalls[0];
}

function buildToolOutputInput(args: { callId: string; output: unknown }): ResponseInput {
  return [
    {
      call_id: args.callId,
      output: JSON.stringify(args.output),
      type: "function_call_output" as const,
    },
  ];
}

function buildKnownToolErrorOutput(error: unknown) {
  if (error instanceof AgentToolPermissionError) {
    return {
      error: {
        code: "forbidden",
        message: error.message,
      },
      ok: false,
    };
  }

  if (error instanceof AgentToolInputError) {
    return {
      error: {
        code: "invalid_input",
        message: error.message,
      },
      ok: false,
    };
  }

  return null;
}

function toOrchestrationToolCall(args: {
  registry: AgentToolRegistry;
  toolCall: {
    arguments: string;
    call_id?: string;
    name: string;
  };
}): AgentOrchestrationToolCall {
  const toolDefinition = getAgentToolDefinition(args.registry, args.toolCall.name);

  return {
    arguments: args.toolCall.arguments,
    callId: args.toolCall.call_id ?? null,
    name: args.toolCall.name,
    sideEffect: toolDefinition?.sideEffect ?? "read",
  };
}

async function executeHomepageTool(args: {
  agentContext: AgentContext;
  registry: AgentToolRegistry;
  toolCall: AgentOrchestrationToolCall;
}) {
  try {
    return await executeAgentToolCall({
      agentContext: args.agentContext,
      registry: args.registry,
      toolCall: {
        arguments: args.toolCall.arguments,
        name: args.toolCall.name,
      },
    });
  } catch (error) {
    const knownToolErrorOutput = buildKnownToolErrorOutput(error);

    if (!knownToolErrorOutput) {
      throw error;
    }

    return knownToolErrorOutput;
  }
}

async function runHomepageFallback(args: {
  attachments: HomepageAssistantAttachment[];
  error?: unknown;
  message: string;
  reason: "empty_response" | "missing_openai_api_key" | "openai_error";
}) {
  return traceSpan(
    {
      input: {
        attachment_count: args.attachments.length,
        message: args.message,
        reason: args.reason,
      },
      metadata: args.error ? getOpenAIErrorMetadata(args.error) : undefined,
      name: "llm.homepage.fallback",
      output: (reply: string) => ({
        output_preview: buildReplyPreview(reply),
        output_text_length: reply.length,
        reason: args.reason,
      }),
      tags: ["provider:fallback", "workflow:homepage_assistant"],
      type: "function",
    },
    () => getFallbackHomepageReply(args.message, args.attachments),
  );
}

async function runSingleRoundHomepageReply(args: {
  agentContext?: AgentContext | null;
  attachments: HomepageAssistantAttachment[];
  contextPreamble?: string | null;
  instructions: string;
  message: string;
  messages?: AgentConversationMessage[] | null;
  toolRegistry?: AgentToolRegistry | null;
  workflowId?: string;
}): Promise<HomepageAssistantReplyResult> {
  const toolRegistry = getEffectiveToolRegistry(args.toolRegistry);
  const workflowId = getEffectiveWorkflowId(args.workflowId);
  const firstInput = buildHomepageModelInput({
    agentContext: args.agentContext,
    attachments: args.attachments,
    contextPreamble: args.contextPreamble,
    message: args.message,
    messages: args.messages,
  });
  const response = await createOpenAIResponse({
    agentContext: args.agentContext,
    input: firstInput,
    instructions: args.instructions,
    name: "llm.openai.responses.create",
    tags: [`workflow:${workflowId}`],
    toolRegistry,
    workflowId,
  });
  const toolCall = extractSingleFunctionToolCall(response);

  if (toolCall && args.agentContext) {
    if (!response.id) {
      throw new OpenAIResponseError("A tool-calling response must include a response id.");
    }

    const toolOutput = await executeHomepageTool({
      agentContext: args.agentContext,
      registry: toolRegistry,
      toolCall: toOrchestrationToolCall({
        registry: toolRegistry,
        toolCall,
      }),
    });
    const followUpResponse = await createOpenAIResponse({
      agentContext: args.agentContext,
      input: buildToolOutputInput({
        callId: toolCall.call_id,
        output: toolOutput,
      }),
      instructions: args.instructions,
      name: "llm.openai.responses.create.tool_follow_up",
      previousResponseId: response.id,
      tags: [`workflow:${workflowId}`, `tool:${toolCall.name}`],
      toolRegistry: filterAgentToolRegistry(toolRegistry, []),
      toolName: toolCall.name,
      workflowId,
    });
    const followUpOutput = followUpResponse.output_text?.trim();

    if (!followUpOutput) {
      return {
        source: "openai_empty_fallback",
        stepsUsed: 2,
        stopReason: "empty_response",
        text: await runHomepageFallback({
          attachments: args.attachments,
          message: args.message,
          reason: "empty_response",
        }),
        toolCallsUsed: 1,
      };
    }

    return {
      source: "openai_single_round",
      stepsUsed: 2,
      stopReason: "completed",
      text: followUpOutput,
      toolCallsUsed: 1,
    };
  }

  const output = response.output_text?.trim();

  if (!output) {
    return {
      source: "openai_empty_fallback",
      stepsUsed: 1,
      stopReason: "empty_response",
      text: await runHomepageFallback({
        attachments: args.attachments,
        message: args.message,
        reason: "empty_response",
      }),
      toolCallsUsed: 0,
    };
  }

  return {
    source: "openai_single_round",
    stepsUsed: 1,
    stopReason: "completed",
    text: output,
    toolCallsUsed: 0,
  };
}

async function runBoundedLoopHomepageReply(args: {
  agentContext?: AgentContext | null;
  attachments: HomepageAssistantAttachment[];
  contextPreamble?: string | null;
  instructions: string;
  loopConfig?: Partial<AgentOrchestrationConfig>;
  message: string;
  messages?: AgentConversationMessage[] | null;
  toolRegistry?: AgentToolRegistry | null;
  workflowId?: string;
}): Promise<HomepageAssistantReplyResult> {
  const toolRegistry = getEffectiveToolRegistry(args.toolRegistry);
  const workflowId = getEffectiveWorkflowId(args.workflowId);
  const initialInput: HomepageOpenAIInput = buildHomepageModelInput({
    agentContext: args.agentContext,
    attachments: args.attachments,
    contextPreamble: args.contextPreamble,
    message: args.message,
    messages: args.messages,
  });
  const loopResult = await runBoundedAgentOrchestration<HomepageOpenAIInput, unknown>({
    buildToolResultInput: ({ toolCall, toolOutput }) =>
      buildToolOutputInput({
        callId: toolCall.callId ?? "",
        output: toolOutput,
      }),
    config: args.loopConfig,
    executeModel: async ({ input, previousResponseId }) => {
      const response = await createOpenAIResponse({
        agentContext: args.agentContext,
        input,
        instructions: args.instructions,
        name: previousResponseId
          ? "llm.openai.responses.create.loop_follow_up"
          : "llm.openai.responses.create",
        previousResponseId,
        tags: [`workflow:${workflowId}`],
        toolRegistry,
        workflowId,
      });
      const toolCall = extractSingleFunctionToolCall(response);

      if (toolCall && !response.id) {
        throw new OpenAIResponseError("A tool-calling response must include a response id.");
      }

      return {
        outputText: response.output_text?.trim() ?? null,
        responseId: response.id ?? null,
        toolCall: toolCall
          ? toOrchestrationToolCall({
              registry: toolRegistry,
              toolCall,
            })
          : null,
      };
    },
    executeTool: async (toolCall) => {
      if (!args.agentContext) {
        throw new OpenAIResponseError("Tool execution requires an agent context.");
      }

      return executeHomepageTool({
        agentContext: args.agentContext,
        registry: toolRegistry,
        toolCall,
      });
    },
    initialInput,
    metadata: getTraceMetadata({
      agentContext: args.agentContext,
      workflowId,
    }),
    traceName: `workflow.${workflowId}.orchestration`,
  });

  if (loopResult.stopReason === "completed" && loopResult.outputText) {
    return {
      source: "openai_bounded_loop",
      stepsUsed: loopResult.stepsUsed,
      stopReason: loopResult.stopReason,
      text: loopResult.outputText,
      toolCallsUsed: loopResult.toolCallsUsed,
    };
  }

  const fallbackReason =
    loopResult.stopReason === "empty_response" ? "empty_response" : "openai_error";

  return {
    source:
      loopResult.stopReason === "empty_response"
        ? "openai_empty_fallback"
        : "openai_error_fallback",
    stepsUsed: loopResult.stepsUsed,
    stopReason: loopResult.stopReason,
    text: await runHomepageFallback({
      attachments: args.attachments,
      message: args.message,
      reason: fallbackReason,
    }),
    toolCallsUsed: loopResult.toolCallsUsed,
  };
}

export async function generateHomepageAssistantReplyDetailed(
  message: string,
  attachments: HomepageAssistantAttachment[] = [],
  options?: HomepageAssistantReplyOptions,
) {
  const result = await traceSpan<HomepageAssistantReplyResult>(
    {
      input: {
        attachment_count: attachments.length,
        conversation_message_count: options?.conversationMessages?.length ?? 0,
        message,
        model: getModel(),
        runtime_mode: resolveRuntimeMode(options?.runtimeMode),
      },
      metadata: getTraceMetadata({
        agentContext: options?.agentContext,
        workflowId: options?.workflowId,
      }),
      name: `workflow.${getEffectiveWorkflowId(options?.workflowId)}.reply`,
      output: (replyResult: HomepageAssistantReplyResult) => ({
        output_preview: buildReplyPreview(replyResult.text),
        output_text_length: replyResult.text.length,
        source: replyResult.source,
        steps_used: replyResult.stepsUsed,
        stop_reason: replyResult.stopReason,
        tool_calls_used: replyResult.toolCallsUsed,
      }),
      tags: [`workflow:${getEffectiveWorkflowId(options?.workflowId)}`],
      type: "task",
    },
    async (): Promise<HomepageAssistantReplyResult> => {
      const starterActionReply = await runDeterministicStarterActionReply({
        agentContext: options?.agentContext,
        starterActionId: options?.starterActionId,
        toolRegistry: options?.toolRegistry,
      });

      if (starterActionReply) {
        return starterActionReply;
      }

      const matchedReply = getMatchedHomepageReply(message, attachments);

      if (matchedReply) {
        return {
          source: "matched_reply",
          stepsUsed: 0,
          stopReason: "completed",
          text: matchedReply,
          toolCallsUsed: 0,
        };
      }

      if (!process.env.OPENAI_API_KEY?.trim()) {
        return {
          source: "missing_openai_api_key_fallback",
          stepsUsed: 0,
          stopReason: "completed",
          text: await runHomepageFallback({
            attachments,
            message,
            reason: "missing_openai_api_key",
          }),
          toolCallsUsed: 0,
        };
      }

      try {
        const runtimeMode = resolveRuntimeMode(options?.runtimeMode);

        if (runtimeMode === "bounded_loop") {
          return await runBoundedLoopHomepageReply({
            agentContext: options?.agentContext,
            attachments,
            contextPreamble: options?.contextPreamble,
            instructions: options?.instructions ?? homepageInstructions,
            loopConfig: options?.loopConfig,
            message,
            messages: options?.conversationMessages,
            toolRegistry: options?.toolRegistry,
            workflowId: options?.workflowId,
          });
        }

        return await runSingleRoundHomepageReply({
          agentContext: options?.agentContext,
          attachments,
          contextPreamble: options?.contextPreamble,
          instructions: options?.instructions ?? homepageInstructions,
          message,
          messages: options?.conversationMessages,
          toolRegistry: options?.toolRegistry,
          workflowId: options?.workflowId,
        });
      } catch (error) {
        console.error("Homepage assistant fell back after an OpenAI response failure", error);

        return {
          source: "openai_error_fallback",
          stepsUsed: 0,
          stopReason: "model_error",
          text: await runHomepageFallback({
            attachments,
            error,
            message,
            reason: "openai_error",
          }),
          toolCallsUsed: 0,
        };
      }
    },
  );

  return result;
}

export async function generateHomepageAssistantReply(
  message: string,
  attachments: HomepageAssistantAttachment[] = [],
  options?: HomepageAssistantReplyOptions,
) {
  const result = await generateHomepageAssistantReplyDetailed(message, attachments, options);

  return result.text;
}

export async function transcribeHomepageAssistantAudio(file: File) {
  const response = await getHomepageOpenAIClient().audio.transcriptions.create({
    file,
    model: getTranscriptionModel(),
  });

  const output = response.text?.trim();

  if (!output) {
    throw new OpenAIResponseError("The transcription came back empty.");
  }

  return output;
}
