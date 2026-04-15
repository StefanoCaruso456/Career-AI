import { defaultW3CPresentationAdapter } from "@/packages/agent-runtime/src";
import { filterAgentToolRegistry, homepageAssistantToolRegistry } from "@/packages/agent-runtime/src/tools";
import type { VerifierAgentRequest } from "@/packages/contracts/src";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import { withTracedRoute } from "@/lib/tracing";
import { buildVerifierAgentContext } from "@/app/api/internal/agents/_shared";
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

const verifierDefinition = getExternalAgentRouteDefinition("verifier");
const verifierParticipant = getA2AProtocolParticipantForAgent("verifier");
const verifierToolRegistry = filterAgentToolRegistry(
  homepageAssistantToolRegistry,
  verifierDefinition.allowedTools,
);

function buildPresentationContextPreamble(
  presentationSummary: ReturnType<typeof defaultW3CPresentationAdapter.summarize>,
) {
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

type VerifierParsedRequest = ExternalAgentParsedRequest<VerifierAgentRequest>;

async function handleExternalVerifierAgentPost(request: Request) {
  let childRunId: string | null = null;
  let parsedRequest: VerifierParsedRequest | null = null;
  let requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let quota = null;
  let routeContext:
    | Awaited<ReturnType<typeof resolveExternalAgentRouteContext>>
    | null = null;

  try {
    routeContext = await resolveExternalAgentRouteContext(request, "verifier");
    parsedRequest = await parseExternalAgentRequest<VerifierAgentRequest>({
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
      tags: ["agent:verifier", `operation:${activeDefinition.operation}`],
    });

    const agentContext = buildVerifierAgentContext({
      runContext: routeContext.runContext,
      serviceActor: routeContext.caller.identity,
    });
    childRunId = agentContext.run.runId;
    const presentationSummary = defaultW3CPresentationAdapter.summarize(
      activeParsedRequest.payload.presentation ?? null,
    );

    await emitExternalA2AProtocolEvent({
      definition: activeDefinition,
      eventName: "a2a.task.accepted",
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.task.accepted",
      status: "accepted",
      tags: ["agent:verifier", `operation:${activeDefinition.operation}`],
    });

    await emitExternalA2AProtocolEvent({
      definition: activeDefinition,
      eventName: "a2a.task.running",
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.task.running",
      status: "running",
      tags: ["agent:verifier", `operation:${activeDefinition.operation}`],
    });

    const result = await traceExternalAgentInvocation({
      childRunId,
      caller: routeContext.caller,
      definition: activeDefinition,
      invoke: () =>
        generateHomepageAssistantReplyDetailed(activeParsedRequest.payload.message, [], {
          agentContext,
          contextPreamble: buildPresentationContextPreamble(presentationSummary),
          conversationMessages: activeParsedRequest.payload.messages,
          instructions: activeDefinition.instructions,
          runtimeMode: "bounded_loop",
          toolRegistry: verifierToolRegistry,
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
      tags: ["agent:verifier", `operation:${activeDefinition.operation}`],
    });

    const response = createExternalAgentResponse({
      caller: routeContext.caller,
      correlationId: routeContext.correlationId,
      definition: activeDefinition,
      durationMs: Date.now() - routeContext.startedAt,
      messageId: activeParsedRequest.messageId,
      presentationSummary,
      quota,
      receiverAgentId: activeParsedRequest.senderAgentId,
      requestId: activeParsedRequest.requestId,
      runId: childRunId,
      senderAgentId: verifierParticipant.agentId,
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
      tags: ["agent:verifier", `operation:${activeDefinition.operation}`],
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
          target_agent_type: "verifier",
          target_endpoint: "/api/a2a/agents/verifier",
        },
        handoffStatus: "failed",
        parsedRequest,
        runId: childRunId ?? routeContext.runContext.runId,
        spanName: "a2a.task.failed",
        status: "failed",
        tags: ["agent:verifier", `operation:${parsedRequest.operation}`],
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
          : withExternalRequestedOperation(verifierDefinition, "respond"),
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
        tags: ["agent:verifier", `operation:${parsedRequest.operation}`],
      });
    }

    return errorResponse;
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
