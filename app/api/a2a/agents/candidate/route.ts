import { filterAgentToolRegistry, homepageAssistantToolRegistry } from "@/packages/agent-runtime/src/tools";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import { withTracedRoute } from "@/lib/tracing";
import { buildCandidateAgentContext } from "@/app/api/internal/agents/_shared";
import { getA2AProtocolParticipantForAgent } from "@/lib/a2a/participants";
import { getExternalAgentRouteDefinition } from "@/lib/a2a/registry";
import {
  assertExternalA2AEnvelopeIdentity,
  createExternalAgentErrorResponse,
  createExternalAgentResponse,
  emitExternalA2AProtocolEvent,
  emitExternalAgentRouteAcceptedEvents,
  logExternalAgentRequestReceived,
  parseExternalAgentRequest,
  reserveExternalAgentQuota,
  resolveExternalAgentRouteContext,
  traceExternalAgentInvocation,
  withExternalRequestedOperation,
  type ExternalAgentParsedRequest,
} from "../_shared";

const candidateDefinition = getExternalAgentRouteDefinition("candidate");
const candidateParticipant = getA2AProtocolParticipantForAgent("candidate");
const candidateToolRegistry = filterAgentToolRegistry(
  homepageAssistantToolRegistry,
  candidateDefinition.allowedTools,
);

export const runtime = "nodejs";

type CandidateParsedRequest = ExternalAgentParsedRequest<{
  message: string;
  messages: { content: string; role: "assistant" | "user" }[];
  talentIdentityId: string;
}>;

async function handleExternalCandidateAgentPost(request: Request) {
  let childRunId: string | null = null;
  let parsedRequest: CandidateParsedRequest | null = null;
  let requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let quota = null;
  let routeContext:
    | Awaited<ReturnType<typeof resolveExternalAgentRouteContext>>
    | null = null;

  try {
    routeContext = await resolveExternalAgentRouteContext(request, "candidate");
    parsedRequest = await parseExternalAgentRequest<CandidateParsedRequest["payload"]>({
      definition: routeContext.definition,
      fallbackRequestId: routeContext.fallbackRequestId,
      request,
    });
    const activeParsedRequest = parsedRequest;
    requestId = activeParsedRequest.requestId;

    const activeDefinition = withExternalRequestedOperation(
      routeContext.definition,
      activeParsedRequest.operation,
    );

    assertExternalA2AEnvelopeIdentity({
      caller: routeContext.caller,
      correlationId: routeContext.correlationId,
      definition: activeDefinition,
      parsedRequest: activeParsedRequest,
    });

    emitExternalAgentRouteAcceptedEvents({
      caller: routeContext.caller,
      definition: activeDefinition,
      requestId: activeParsedRequest.requestId,
      runId: routeContext.runContext.runId,
      version: activeParsedRequest.version,
    });

    quota = reserveExternalAgentQuota({
      caller: routeContext.caller,
      correlationId: routeContext.correlationId,
      definition: activeDefinition,
      requestId: activeParsedRequest.requestId,
      runId: routeContext.runContext.runId,
    });

    logExternalAgentRequestReceived({
      caller: routeContext.caller,
      correlationId: routeContext.correlationId,
      definition: activeDefinition,
      requestId: activeParsedRequest.requestId,
      runId: routeContext.runContext.runId,
      version: activeParsedRequest.version,
    });

    await emitExternalA2AProtocolEvent({
      definition: activeDefinition,
      eventName: "a2a.message.received",
      handoffId: `handoff:${activeParsedRequest.messageId}`,
      handoffMetadata: {
        handoff_type: "external_a2a_dispatch",
        target_agent_type: activeDefinition.agentType,
        target_endpoint: activeDefinition.endpointPath,
      },
      handoffStatus: "accepted",
      parsedRequest: activeParsedRequest,
      runId: routeContext.runContext.runId,
      spanName: "a2a.message.received",
      status: "accepted",
      tags: ["agent:candidate", `operation:${activeDefinition.operation}`],
    });

    const agentContext = await buildCandidateAgentContext({
      correlationId: routeContext.correlationId,
      runContext: routeContext.runContext,
      talentIdentityId: activeParsedRequest.payload.talentIdentityId,
    });
    childRunId = agentContext.run.runId;

    await emitExternalA2AProtocolEvent({
      definition: activeDefinition,
      eventName: "a2a.task.accepted",
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.task.accepted",
      status: "accepted",
      tags: ["agent:candidate", `operation:${activeDefinition.operation}`],
    });

    await emitExternalA2AProtocolEvent({
      definition: activeDefinition,
      eventName: "a2a.task.running",
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.task.running",
      status: "running",
      tags: ["agent:candidate", `operation:${activeDefinition.operation}`],
    });

    const result = await traceExternalAgentInvocation({
      childRunId,
      caller: routeContext.caller,
      definition: activeDefinition,
      invoke: () =>
        generateHomepageAssistantReplyDetailed(activeParsedRequest.payload.message, [], {
          agentContext,
          conversationMessages: activeParsedRequest.payload.messages,
          instructions: activeDefinition.instructions,
          runtimeMode: "bounded_loop",
          toolRegistry: candidateToolRegistry,
          workflowId: activeDefinition.workflowId,
        }),
      parentRunId: routeContext.runContext.runId,
      requestId: activeParsedRequest.requestId,
      version: activeParsedRequest.version,
    });

    const completedAt = new Date().toISOString();

    await emitExternalA2AProtocolEvent({
      completedAt,
      definition: activeDefinition,
      eventName: "a2a.task.completed",
      output: {
        run_id: childRunId,
        stop_reason: result.stopReason,
      },
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.task.completed",
      status: "completed",
      tags: ["agent:candidate", `operation:${activeDefinition.operation}`],
    });

    const response = createExternalAgentResponse({
      caller: routeContext.caller,
      correlationId: routeContext.correlationId,
      definition: activeDefinition,
      durationMs: Date.now() - routeContext.startedAt,
      messageId: activeParsedRequest.messageId,
      quota,
      receiverAgentId: activeParsedRequest.senderAgentId,
      requestId: activeParsedRequest.requestId,
      runId: childRunId,
      senderAgentId: candidateParticipant.agentId,
      stepsUsed: result.stepsUsed,
      stopReason: result.stopReason,
      taskStatus: "completed",
      toolCallsUsed: result.toolCallsUsed,
      traceId: activeParsedRequest.traceId,
      reply: result.text,
    });

    await emitExternalA2AProtocolEvent({
      completedAt,
      definition: activeDefinition,
      eventName: "a2a.response.sent",
      output: {
        http_status: response.status,
        request_id: activeParsedRequest.requestId,
      },
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.response.sent",
      status: "completed",
      tags: ["agent:candidate", `operation:${activeDefinition.operation}`],
    });

    return response;
  } catch (error) {
    if (routeContext && parsedRequest) {
      await emitExternalA2AProtocolEvent({
        completedAt: new Date().toISOString(),
        definition: withExternalRequestedOperation(routeContext.definition, parsedRequest.operation),
        eventName: "a2a.task.failed",
        handoffId: `handoff:${parsedRequest.messageId}`,
        handoffMetadata: {
          handoff_type: "external_a2a_dispatch",
          target_agent_type: "candidate",
          target_endpoint: "/api/a2a/agents/candidate",
        },
        handoffStatus: "failed",
        parsedRequest,
        runId: childRunId ?? routeContext.runContext.runId,
        spanName: "a2a.task.failed",
        status: "failed",
        tags: ["agent:candidate", `operation:${parsedRequest.operation}`],
      });
    }

    const errorResponse = createExternalAgentErrorResponse({
      caller: routeContext?.caller ?? null,
      correlationId:
        routeContext?.correlationId ??
        (request.headers.get("x-correlation-id") ?? crypto.randomUUID()),
      childRunId,
      definition:
        routeContext && parsedRequest
          ? withExternalRequestedOperation(routeContext.definition, parsedRequest.operation)
          : withExternalRequestedOperation(candidateDefinition, "respond"),
      durationMs: routeContext ? Date.now() - routeContext.startedAt : 0,
      error,
      messageId: parsedRequest?.messageId ?? null,
      parsedRequest,
      quota,
      requestId,
      runId: routeContext?.runContext.runId ?? null,
    });

    if (routeContext && parsedRequest) {
      await emitExternalA2AProtocolEvent({
        completedAt: new Date().toISOString(),
        definition: withExternalRequestedOperation(routeContext.definition, parsedRequest.operation),
        eventName: "a2a.response.sent",
        output: {
          http_status: errorResponse.status,
          request_id: parsedRequest.requestId,
        },
        parsedRequest,
        runId: childRunId ?? routeContext.runContext.runId,
        spanName: "a2a.response.sent",
        status: "failed",
        tags: ["agent:candidate", `operation:${parsedRequest.operation}`],
      });
    }

    return errorResponse;
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
