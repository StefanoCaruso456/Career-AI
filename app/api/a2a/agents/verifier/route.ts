import { defaultW3CPresentationAdapter } from "@/packages/agent-runtime/src";
import {
  filterAgentToolRegistry,
  homepageAssistantToolRegistry,
} from "@/packages/agent-runtime/src/tools";
import type { VerifierAgentRequest } from "@/packages/contracts/src";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import { withTracedRoute } from "@/lib/tracing";
import { buildVerifierAgentContext } from "@/app/api/internal/agents/_shared";
import { getExternalAgentRouteDefinition } from "@/lib/a2a/registry";
import {
  createExternalAgentErrorResponse,
  createExternalAgentResponse,
  logExternalAgentRequestReceived,
  parseExternalAgentRequest,
  reserveExternalAgentQuota,
  resolveExternalAgentRouteContext,
  traceExternalAgentInvocation,
} from "../_shared";

const verifierDefinition = getExternalAgentRouteDefinition("verifier");
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

async function handleExternalVerifierAgentPost(request: Request) {
  let childRunId: string | null = null;
  let requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let quota = null;
  let routeContext:
    | Awaited<ReturnType<typeof resolveExternalAgentRouteContext>>
    | null = null;

  try {
    routeContext = await resolveExternalAgentRouteContext(request, "verifier");
    const activeRouteContext = routeContext;
    const parsedRequest = await parseExternalAgentRequest<VerifierAgentRequest>({
      definition: activeRouteContext.definition,
      fallbackRequestId: activeRouteContext.fallbackRequestId,
      request,
    });
    requestId = parsedRequest.requestId;
    quota = reserveExternalAgentQuota({
      caller: activeRouteContext.caller,
      correlationId: activeRouteContext.correlationId,
      definition: activeRouteContext.definition,
      requestId: parsedRequest.requestId,
      runId: activeRouteContext.runContext.runId,
    });

    logExternalAgentRequestReceived({
      caller: activeRouteContext.caller,
      correlationId: activeRouteContext.correlationId,
      definition: activeRouteContext.definition,
      requestId: parsedRequest.requestId,
      runId: activeRouteContext.runContext.runId,
      version: parsedRequest.version,
    });

    const agentContext = buildVerifierAgentContext({
      runContext: activeRouteContext.runContext,
      serviceActor: activeRouteContext.caller.identity,
    });
    childRunId = agentContext.run.runId;
    const presentationSummary = defaultW3CPresentationAdapter.summarize(
      parsedRequest.payload.presentation ?? null,
    );
    const result = await traceExternalAgentInvocation({
      childRunId: agentContext.run.runId,
      caller: activeRouteContext.caller,
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
      version: parsedRequest.version,
    });

    return createExternalAgentResponse({
      caller: activeRouteContext.caller,
      correlationId: activeRouteContext.correlationId,
      definition: activeRouteContext.definition,
      durationMs: Date.now() - activeRouteContext.startedAt,
      parentRunId: activeRouteContext.runContext.runId,
      presentationSummary,
      quota,
      reply: result.text,
      requestId: parsedRequest.requestId,
      runId: agentContext.run.runId,
      stepsUsed: result.stepsUsed,
      stopReason: result.stopReason,
      toolCallsUsed: result.toolCallsUsed,
    });
  } catch (error) {
    return createExternalAgentErrorResponse({
      caller: routeContext?.caller ?? null,
      correlationId: routeContext?.correlationId ?? (request.headers.get("x-correlation-id") ?? crypto.randomUUID()),
      childRunId,
      definition: routeContext?.definition ?? verifierDefinition,
      durationMs: routeContext ? Date.now() - routeContext.startedAt : 0,
      error,
      parentRunId: routeContext?.runContext.runId ?? null,
      quota,
      requestId,
      runId: routeContext?.runContext.runId ?? null,
    });
  }
}

export const POST = withTracedRoute(
  {
    name: "http.route.a2a.agents.verifier.post",
    tags: ["route:a2a", "agent:verifier"],
    type: "task",
  },
  handleExternalVerifierAgentPost,
);
