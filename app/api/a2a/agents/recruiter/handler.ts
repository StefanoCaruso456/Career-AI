import { filterAgentToolRegistry, homepageAssistantToolRegistry } from "@/packages/agent-runtime/src/tools";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import {
  recruiterCandidateSearchPayloadSchema,
  type InternalAgentStopReason,
} from "@/packages/contracts/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import { buildRecruiterAgentContext } from "@/app/api/internal/agents/_shared";
import { traceSpan } from "@/lib/tracing";
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
import { z } from "zod";

const recruiterDefinition = getExternalAgentRouteDefinition("recruiter");
const recruiterParticipant = getA2AProtocolParticipantForAgent("recruiter");
const recruiterToolRegistry = filterAgentToolRegistry(
  homepageAssistantToolRegistry,
  recruiterDefinition.allowedTools,
);

type RecruiterRespondPayload = {
  message: string;
  messages: { content: string; role: "assistant" | "user" }[];
  organizationId: string | null;
  userId: string;
};

type RecruiterCandidateSearchPayload = z.infer<typeof recruiterCandidateSearchPayloadSchema>;

type RecruiterA2AParsedRequest = ExternalAgentParsedRequest<
  RecruiterRespondPayload | RecruiterCandidateSearchPayload
>;

function isCandidateSearchRequest(
  request: RecruiterA2AParsedRequest,
): request is ExternalAgentParsedRequest<RecruiterCandidateSearchPayload> {
  return request.operation === "candidate_search";
}

function buildHandoffId(messageId: string) {
  return `handoff:${messageId}`;
}

function buildProtocolEventSummary(result: {
  runId?: string | null;
  stopReason?: string | null;
  totalMatches?: number | null;
}) {
  return {
    run_id: result.runId ?? null,
    stop_reason: result.stopReason ?? null,
    total_matches: result.totalMatches ?? null,
  };
}

async function traceRecruiterRespondFlow(args: {
  agentContext: Awaited<ReturnType<typeof buildRecruiterAgentContext>>;
  childRunId: string;
  definition: typeof recruiterDefinition & { operation: "respond" };
  parsedRequest: ExternalAgentParsedRequest<RecruiterRespondPayload>;
  routeContext: Awaited<ReturnType<typeof resolveExternalAgentRouteContext>>;
}) {
  await emitExternalA2AProtocolEvent({
    definition: args.definition,
    eventName: "a2a.task.running",
    parsedRequest: args.parsedRequest,
    runId: args.childRunId,
    spanName: "a2a.task.running",
    status: "running",
    tags: ["agent:recruiter", "operation:respond"],
  });

  return traceExternalAgentInvocation({
    childRunId: args.childRunId,
    caller: args.routeContext.caller,
    definition: args.definition,
    invoke: () =>
      generateHomepageAssistantReplyDetailed(args.parsedRequest.payload.message, [], {
        agentContext: args.agentContext,
        conversationMessages: args.parsedRequest.payload.messages,
        instructions: args.definition.instructions,
        runtimeMode: "bounded_loop",
        toolRegistry: recruiterToolRegistry,
        workflowId: args.definition.workflowId,
      }),
    parentRunId: args.routeContext.runContext.runId,
    requestId: args.parsedRequest.requestId,
    version: args.parsedRequest.version,
  });
}

async function traceRecruiterCandidateSearchFlow(args: {
  childRunId: string;
  definition: typeof recruiterDefinition & { operation: "candidate_search" };
  parsedRequest: ExternalAgentParsedRequest<RecruiterCandidateSearchPayload>;
  routeContext: Awaited<ReturnType<typeof resolveExternalAgentRouteContext>>;
}) {
  await emitExternalA2AProtocolEvent({
    definition: args.definition,
    eventName: "a2a.task.running",
    parsedRequest: args.parsedRequest,
    runId: args.childRunId,
    spanName: "a2a.task.running",
    status: "running",
    tags: ["agent:recruiter", "operation:candidate_search"],
  });

  const startedAt = Date.now();
  return traceExternalAgentInvocation({
    childRunId: args.childRunId,
    caller: args.routeContext.caller,
    definition: args.definition,
    invoke: () =>
      traceSpan(
        {
          metadata: {
            endpoint: args.definition.endpointPath,
            operation: "candidate_search",
            request_id: args.parsedRequest.requestId,
            sender_agent_id: args.parsedRequest.senderAgentId,
            source_endpoint:
              args.parsedRequest.context.sourceEndpoint ?? args.parsedRequest.replyTo ?? null,
            trace_id: args.parsedRequest.traceId,
          },
          metrics: {
            duration_ms: Date.now() - startedAt,
          },
          name: "internal.agent.recruiter.candidate_search",
          tags: ["external_a2a", "agent:recruiter", "operation:candidate_search"],
          type: "task",
        },
        () =>
          searchEmployerCandidates({
            filters: args.parsedRequest.payload.filters,
            limit: args.parsedRequest.payload.limit,
            prompt: args.parsedRequest.payload.prompt,
          }),
      ),
    parentRunId: args.routeContext.runContext.runId,
    requestId: args.parsedRequest.requestId,
    version: args.parsedRequest.version,
  });
}

export async function handleExternalRecruiterAgentPost(request: Request) {
  let childRunId: string | null = null;
  let parsedRequest: RecruiterA2AParsedRequest | null = null;
  let quota = null;
  let requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  let routeContext:
    | Awaited<ReturnType<typeof resolveExternalAgentRouteContext>>
    | null = null;

  try {
    routeContext = await resolveExternalAgentRouteContext(request, "recruiter");
    parsedRequest = await parseExternalAgentRequest<RecruiterRespondPayload | RecruiterCandidateSearchPayload>({
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

    const handoffId = buildHandoffId(activeParsedRequest.messageId);

    await emitExternalA2AProtocolEvent({
      definition: activeDefinition,
      eventName: "a2a.message.received",
      handoffId,
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
      tags: ["agent:recruiter", `operation:${activeDefinition.operation}`],
    });

    const agentContext = await buildRecruiterAgentContext({
      correlationId: routeContext.correlationId,
      organizationId: activeParsedRequest.payload.organizationId ?? null,
      runContext: routeContext.runContext,
      userId: activeParsedRequest.payload.userId,
    });
    childRunId = agentContext.run.runId;

    await emitExternalA2AProtocolEvent({
      definition: activeDefinition,
      eventName: "a2a.task.accepted",
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.task.accepted",
      status: "accepted",
      tags: ["agent:recruiter", `operation:${activeDefinition.operation}`],
    });

    const completedAt = new Date().toISOString();
    let response: Response;

    if (isCandidateSearchRequest(activeParsedRequest)) {
      const result = await traceRecruiterCandidateSearchFlow({
        childRunId,
        definition: activeDefinition as typeof recruiterDefinition & { operation: "candidate_search" },
        parsedRequest: activeParsedRequest,
        routeContext,
      });

      await emitExternalA2AProtocolEvent({
        completedAt,
        definition: activeDefinition,
        eventName: "a2a.task.completed",
        output: buildProtocolEventSummary({
          runId: childRunId,
          totalMatches: result.totalMatches,
        }),
        parsedRequest: activeParsedRequest,
        runId: childRunId,
        spanName: "a2a.task.completed",
        status: "completed",
        tags: ["agent:recruiter", `operation:${activeDefinition.operation}`],
      });

      response = createExternalAgentResponse({
        caller: routeContext.caller,
        correlationId: routeContext.correlationId,
        definition: activeDefinition,
        durationMs: Date.now() - routeContext.startedAt,
        messageId: activeParsedRequest.messageId,
        quota,
        receiverAgentId: activeParsedRequest.senderAgentId,
        requestId: activeParsedRequest.requestId,
        result,
        runId: childRunId,
        senderAgentId: recruiterParticipant.agentId,
        taskStatus: "completed",
        traceId: activeParsedRequest.traceId,
      });
    } else {
      const respondParsedRequest =
        activeParsedRequest as ExternalAgentParsedRequest<RecruiterRespondPayload>;
      const result = await traceRecruiterRespondFlow({
        childRunId,
        agentContext,
        definition: activeDefinition as typeof recruiterDefinition & { operation: "respond" },
        parsedRequest: respondParsedRequest,
        routeContext,
      });

      await emitExternalA2AProtocolEvent({
        completedAt,
        definition: activeDefinition,
        eventName: "a2a.task.completed",
        output: buildProtocolEventSummary({
          runId: childRunId,
          stopReason: result.stopReason,
        }),
        parsedRequest: respondParsedRequest,
        runId: childRunId,
        spanName: "a2a.task.completed",
        status: "completed",
        tags: ["agent:recruiter", `operation:${activeDefinition.operation}`],
      });

      response = createExternalAgentResponse({
        caller: routeContext.caller,
        correlationId: routeContext.correlationId,
        definition: activeDefinition,
        durationMs: Date.now() - routeContext.startedAt,
        messageId: respondParsedRequest.messageId,
        quota,
        receiverAgentId: respondParsedRequest.senderAgentId,
        requestId: respondParsedRequest.requestId,
        runId: childRunId,
        senderAgentId: recruiterParticipant.agentId,
        stepsUsed: result.stepsUsed,
        stopReason: result.stopReason as InternalAgentStopReason,
        taskStatus: "completed",
        toolCallsUsed: result.toolCallsUsed,
        traceId: respondParsedRequest.traceId,
        reply: result.text,
      });
    }

    await emitExternalA2AProtocolEvent({
      completedAt,
      definition: activeDefinition,
      eventName: "a2a.response.sent",
      parsedRequest: activeParsedRequest,
      runId: childRunId,
      spanName: "a2a.response.sent",
      status: "completed",
      output: {
        http_status: response.status,
        request_id: activeParsedRequest.requestId,
      },
      tags: ["agent:recruiter", `operation:${activeDefinition.operation}`],
    });

    return response;
  } catch (error) {
    if (routeContext && parsedRequest) {
      const completedAt = new Date().toISOString();
      const activeDefinition = withExternalRequestedOperation(
        routeContext.definition,
        parsedRequest.operation,
      );
      const failedRunId = childRunId ?? routeContext.runContext.runId;

      await emitExternalA2AProtocolEvent({
        completedAt,
        definition: activeDefinition,
        eventName: "a2a.task.failed",
        handoffId: buildHandoffId(parsedRequest.messageId),
        handoffMetadata: {
          handoff_type: "external_a2a_dispatch",
          target_agent_type: activeDefinition.agentType,
          target_endpoint: activeDefinition.endpointPath,
        },
        handoffStatus: "failed",
        output: {
          request_id: parsedRequest.requestId,
        },
        parsedRequest,
        runId: failedRunId,
        spanName: "a2a.task.failed",
        status: "failed",
        tags: ["agent:recruiter", `operation:${activeDefinition.operation}`],
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
          : withExternalRequestedOperation(recruiterDefinition, "respond"),
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
        tags: ["agent:recruiter", `operation:${parsedRequest.operation}`],
      });
    }

    return errorResponse;
  }
}
