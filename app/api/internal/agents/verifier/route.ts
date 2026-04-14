import { withTracedRoute } from "@/lib/tracing";
import { getInternalAgentRouteDefinition } from "@/lib/internal-agents/registry";
import { defaultW3CPresentationAdapter } from "@/packages/agent-runtime/src";
import {
  filterAgentToolRegistry,
  homepageAssistantToolRegistry,
} from "@/packages/agent-runtime/src/tools";
import { verifierAgentRequestSchema } from "@/packages/contracts/src";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import {
  buildVerifierAgentContext,
  createInternalAgentErrorResponse,
  createInternalAgentResponse,
  logInternalAgentRequestReceived,
  parseInternalAgentRequest,
  reserveInternalAgentQuota,
  resolveInternalAgentRouteContext,
  traceInternalAgentInvocation,
} from "../_shared";

const verifierDefinition = getInternalAgentRouteDefinition("verifier");
const verifierToolRegistry = filterAgentToolRegistry(
  homepageAssistantToolRegistry,
  verifierDefinition.allowedTools,
);

function buildPresentationContextPreamble(presentationSummary: ReturnType<typeof defaultW3CPresentationAdapter.summarize>) {
  if (!presentationSummary) {
    return null;
  }

  return [
    "W3C presentation context:",
    `- format: ${presentationSummary.format ?? "unknown"}`,
    `- definition_id: ${presentationSummary.definitionId ?? "none"}`,
    `- descriptor_ids: ${presentationSummary.descriptorIds.join(", ") || "none"}`,
    `- holder_did: ${presentationSummary.holderDid ?? "none"}`,
    `- has_presentation: ${presentationSummary.hasPresentation ? "true" : "false"}`,
  ].join("\n");
}

export const runtime = "nodejs";

async function handleVerifierAgentPost(request: Request) {
  let childRunId: string | null = null;
  let requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let quota = null;
  let routeContext:
    | Awaited<ReturnType<typeof resolveInternalAgentRouteContext>>
    | null = null;

  try {
    routeContext = await resolveInternalAgentRouteContext(request, "verifier");
    const activeRouteContext = routeContext;
    const parsedRequest = await parseInternalAgentRequest({
      definition: activeRouteContext.definition,
      fallbackRequestId: activeRouteContext.fallbackRequestId,
      legacySchema: verifierAgentRequestSchema,
      request,
    });
    requestId = parsedRequest.requestId;
    quota = reserveInternalAgentQuota({
      correlationId: activeRouteContext.correlationId,
      definition: activeRouteContext.definition,
      requestId: parsedRequest.requestId,
      runId: activeRouteContext.runContext.runId,
      serviceActor: activeRouteContext.serviceActor,
    });

    logInternalAgentRequestReceived({
      correlationId: activeRouteContext.correlationId,
      definition: activeRouteContext.definition,
      requestId: parsedRequest.requestId,
      runId: activeRouteContext.runContext.runId,
      serviceActor: activeRouteContext.serviceActor,
      version: parsedRequest.version,
    });

    const agentContext = buildVerifierAgentContext({
      runContext: activeRouteContext.runContext,
      serviceActor: activeRouteContext.serviceActor,
    });
    childRunId = agentContext.run.runId;
    const presentationSummary = defaultW3CPresentationAdapter.summarize(
      parsedRequest.payload.presentation ?? null,
    );
    const result = await traceInternalAgentInvocation({
      childRunId: agentContext.run.runId,
      definition: activeRouteContext.definition,
      invoke: () =>
        generateHomepageAssistantReplyDetailed(parsedRequest.payload.message, [], {
          agentContext,
          contextPreamble: buildPresentationContextPreamble(presentationSummary),
          conversationMessages: parsedRequest.payload.messages,
          instructions: activeRouteContext.definition.instructions,
          runtimeMode: "bounded_loop",
          toolRegistry: verifierToolRegistry,
          workflowId: activeRouteContext.definition.workflowId,
        }),
      parentRunId: activeRouteContext.runContext.runId,
      requestId: parsedRequest.requestId,
      serviceActor: activeRouteContext.serviceActor,
      version: parsedRequest.version,
    });

    return createInternalAgentResponse({
      correlationId: activeRouteContext.correlationId,
      definition: activeRouteContext.definition,
      durationMs: Date.now() - activeRouteContext.startedAt,
      parentRunId: activeRouteContext.runContext.runId,
      presentationSummary,
      quota,
      reply: result.text,
      requestId: parsedRequest.requestId,
      runId: agentContext.run.runId,
      serviceActor: activeRouteContext.serviceActor,
      stepsUsed: result.stepsUsed,
      stopReason: result.stopReason,
      toolCallsUsed: result.toolCallsUsed,
    });
  } catch (error) {
    return createInternalAgentErrorResponse({
      correlationId: routeContext?.correlationId ?? (request.headers.get("x-correlation-id") ?? crypto.randomUUID()),
      childRunId,
      definition: routeContext?.definition ?? verifierDefinition,
      durationMs: routeContext ? Date.now() - routeContext.startedAt : 0,
      error,
      parentRunId: routeContext?.runContext.runId ?? null,
      quota,
      requestId,
      runId: routeContext?.runContext.runId ?? null,
      serviceActor: routeContext?.serviceActor ?? null,
    });
  }
}

export const POST = withTracedRoute(
  {
    name: "http.route.internal.agents.verifier.post",
    tags: ["route:internal_agent", "agent:verifier"],
    type: "task",
  },
  handleVerifierAgentPost,
);
