import {
  filterAgentToolRegistry,
  homepageAssistantToolRegistry,
} from "@/packages/agent-runtime/src/tools";
import { recruiterAgentRequestSchema } from "@/packages/contracts/src";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import { withTracedRoute } from "@/lib/tracing";
import {
  buildRecruiterAgentContext,
  createInternalAgentErrorResponse,
  createInternalAgentResponse,
  logInternalAgentRequestReceived,
  parseInternalAgentRequest,
  reserveInternalAgentQuota,
  resolveInternalAgentRouteContext,
  traceInternalAgentInvocation,
} from "../_shared";
import { getInternalAgentRouteDefinition } from "@/lib/internal-agents/registry";

const recruiterDefinition = getInternalAgentRouteDefinition("recruiter");
const recruiterToolRegistry = filterAgentToolRegistry(
  homepageAssistantToolRegistry,
  recruiterDefinition.allowedTools,
);

export const runtime = "nodejs";

async function handleRecruiterAgentPost(request: Request) {
  let childRunId: string | null = null;
  let requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let quota = null;
  let routeContext:
    | Awaited<ReturnType<typeof resolveInternalAgentRouteContext>>
    | null = null;

  try {
    routeContext = await resolveInternalAgentRouteContext(request, "recruiter");
    const activeRouteContext = routeContext;
    const parsedRequest = await parseInternalAgentRequest({
      definition: activeRouteContext.definition,
      fallbackRequestId: activeRouteContext.fallbackRequestId,
      legacySchema: recruiterAgentRequestSchema,
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

    const agentContext = await buildRecruiterAgentContext({
      correlationId: activeRouteContext.correlationId,
      organizationId: parsedRequest.payload.organizationId,
      runContext: activeRouteContext.runContext,
      userId: parsedRequest.payload.userId,
    });
    childRunId = agentContext.run.runId;
    const result = await traceInternalAgentInvocation({
      childRunId: agentContext.run.runId,
      definition: activeRouteContext.definition,
      invoke: () =>
        generateHomepageAssistantReplyDetailed(parsedRequest.payload.message, [], {
          agentContext,
          conversationMessages: parsedRequest.payload.messages,
          instructions: activeRouteContext.definition.instructions,
          runtimeMode: "bounded_loop",
          toolRegistry: recruiterToolRegistry,
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
      definition: routeContext?.definition ?? recruiterDefinition,
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
    name: "http.route.internal.agents.recruiter.post",
    tags: ["route:internal_agent", "agent:recruiter"],
    type: "task",
  },
  handleRecruiterAgentPost,
);
