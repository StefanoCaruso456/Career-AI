import {
  filterAgentToolRegistry,
  homepageAssistantToolRegistry,
} from "@/packages/agent-runtime/src/tools";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import { withTracedRoute } from "@/lib/tracing";
import { buildCandidateAgentContext } from "@/app/api/internal/agents/_shared";
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

const candidateDefinition = getExternalAgentRouteDefinition("candidate");
const candidateToolRegistry = filterAgentToolRegistry(
  homepageAssistantToolRegistry,
  candidateDefinition.allowedTools,
);

export const runtime = "nodejs";

async function handleExternalCandidateAgentPost(request: Request) {
  let requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let quota = null;
  let routeContext:
    | Awaited<ReturnType<typeof resolveExternalAgentRouteContext>>
    | null = null;

  try {
    routeContext = await resolveExternalAgentRouteContext(request, "candidate");
    const activeRouteContext = routeContext;
    const parsedRequest = await parseExternalAgentRequest<{
      message: string;
      messages: { content: string; role: "assistant" | "user" }[];
      talentIdentityId: string;
    }>({
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

    const agentContext = await buildCandidateAgentContext({
      correlationId: activeRouteContext.correlationId,
      runContext: activeRouteContext.runContext,
      talentIdentityId: parsedRequest.payload.talentIdentityId,
    });
    const result = await traceExternalAgentInvocation({
      caller: activeRouteContext.caller,
      definition: activeRouteContext.definition,
      invoke: () =>
        generateHomepageAssistantReplyDetailed(parsedRequest.payload.message, [], {
          agentContext,
          conversationMessages: parsedRequest.payload.messages,
          instructions: activeRouteContext.definition.instructions,
          runtimeMode: "bounded_loop",
          toolRegistry: candidateToolRegistry,
          workflowId: activeRouteContext.definition.workflowId,
        }),
      requestId: parsedRequest.requestId,
      version: parsedRequest.version,
    });

    return createExternalAgentResponse({
      caller: activeRouteContext.caller,
      correlationId: activeRouteContext.correlationId,
      definition: activeRouteContext.definition,
      durationMs: Date.now() - activeRouteContext.startedAt,
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
      definition: routeContext?.definition ?? candidateDefinition,
      durationMs: routeContext ? Date.now() - routeContext.startedAt : 0,
      error,
      quota,
      requestId,
      runId: routeContext?.runContext.runId ?? null,
    });
  }
}

export const POST = withTracedRoute(
  {
    name: "http.route.a2a.agents.candidate.post",
    tags: ["route:a2a", "agent:candidate"],
    type: "task",
  },
  handleExternalCandidateAgentPost,
);
