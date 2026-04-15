import type { AuthenticatedActorIdentity } from "@/actor-identity";
import { handleExternalRecruiterAgentPost } from "@/app/api/a2a/agents/recruiter/handler";
import { emitAgentHandoffEvent, traceAgentHandoff } from "@/lib/agent-handoff-tracing";
import { resolveExternalAgentBearerTokenForService } from "@/lib/a2a/auth";
import {
  getA2AProtocolParticipantForAgent,
  getEmployerSearchGatewayParticipant,
} from "@/lib/a2a/participants";
import { emitA2AProtocolEvent } from "@/lib/a2a/protocol-runtime";
import { createRunContext } from "@/packages/agent-runtime/src";
import type { EmployerCandidateSearchFiltersDto, EmployerCandidateSearchResponseDto } from "@/packages/contracts/src";
import { externalAgentErrorResponseSchema, externalAgentSuccessResponseSchema } from "@/packages/contracts/src";
import { ApiError } from "@/packages/contracts/src";
import { getRequestTraceContext, updateRequestTraceContext } from "@/lib/tracing";

export type RecruiterProductSearchDispatchArgs = {
  actorIdentity: AuthenticatedActorIdentity;
  conversationId?: string | null;
  correlationId: string;
  filters?: EmployerCandidateSearchFiltersDto;
  limit?: number;
  prompt: string;
  sourceEndpoint: string;
};

const gatewayParticipant = getEmployerSearchGatewayParticipant();
const recruiterParticipant = getA2AProtocolParticipantForAgent("recruiter");

function buildDispatchMetadata(args: {
  actorIdentity: AuthenticatedActorIdentity;
  childRunId?: string | null;
  messageId: string;
  parentRunId: string;
  requestId: string;
  sourceEndpoint: string;
  taskStatus?: string | null;
}) {
  return {
    a2aProtocolVersion: "a2a.v1",
    a2aRequestId: args.requestId,
    authSubject: gatewayParticipant.authSubject,
    childRunId: args.childRunId ?? null,
    handoffReason: "product_route_delegate",
    handoffType: "external_a2a_dispatch",
    messageId: args.messageId,
    operation: "candidate_search",
    parentRunId: args.parentRunId,
    permissionDecision: "allowed",
    sourceEndpoint: args.sourceEndpoint,
    targetAgentType: "recruiter",
    targetEndpoint: "/api/a2a/agents/recruiter",
    taskStatus: args.taskStatus ?? null,
  } as const;
}

function getGatewayBearerToken() {
  const token = resolveExternalAgentBearerTokenForService({
    serviceActorId: gatewayParticipant.agentId,
    serviceName: gatewayParticipant.name,
  });

  if (token) {
    return token;
  }

  throw new ApiError({
    errorCode: "INTERNAL_ERROR",
    status: 500,
    message: "Employer recruiter A2A dispatch is not configured with a gateway bearer token.",
    details: {
      serviceActorId: gatewayParticipant.agentId,
      serviceName: gatewayParticipant.name,
    },
    correlationId: getRequestTraceContext()?.requestId ?? crypto.randomUUID(),
  });
}

export async function searchEmployerCandidatesViaRecruiterAgentBoundary(
  args: RecruiterProductSearchDispatchArgs,
): Promise<EmployerCandidateSearchResponseDto> {
  const requestTraceContext = getRequestTraceContext();
  const requestId = requestTraceContext?.requestId ?? crypto.randomUUID();
  const traceId = requestTraceContext?.traceId ?? requestId;
  const previousRunId = requestTraceContext?.runId ?? null;
  const parentRunContext = createRunContext({
    correlationId: args.correlationId,
  });
  const messageId = crypto.randomUUID();
  const sentAt = new Date().toISOString();

  updateRequestTraceContext({
    runId: parentRunContext.runId,
  });

  emitAgentHandoffEvent({
    event: "start",
    metadata: buildDispatchMetadata({
      actorIdentity: args.actorIdentity,
      messageId,
      parentRunId: parentRunContext.runId,
      requestId,
      sourceEndpoint: args.sourceEndpoint,
      taskStatus: "started",
    }),
    output: {
      request_id: requestId,
    },
    tags: ["external_a2a", "product_flow"],
  });

  emitAgentHandoffEvent({
    event: "authz",
    metadata: buildDispatchMetadata({
      actorIdentity: args.actorIdentity,
      messageId,
      parentRunId: parentRunContext.runId,
      requestId,
      sourceEndpoint: args.sourceEndpoint,
    }),
    output: {
      request_id: requestId,
      sender_agent_id: gatewayParticipant.agentId,
    },
    tags: ["external_a2a", "product_flow"],
  });

  await emitA2AProtocolEvent({
    eventName: "a2a.message.created",
    output: {
      request_id: requestId,
      source_endpoint: args.sourceEndpoint,
    },
    protocolContext: {
      authJson: {
        authType: "external_service_bearer",
        authenticatedSenderId: gatewayParticipant.agentId,
        serviceName: gatewayParticipant.name,
      },
      contextJson: {
        callerName: gatewayParticipant.name,
        conversationId: args.conversationId ?? null,
        correlationId: args.correlationId,
        sourceEndpoint: args.sourceEndpoint,
      },
      conversationId: args.conversationId ?? null,
      messageId,
      operation: "candidate_search",
      parentRunId: parentRunContext.runId,
      payloadJson: {
        filters: args.filters ?? null,
        limit: args.limit ?? null,
        organizationId: null,
        prompt: args.prompt,
        userId: args.actorIdentity.appUserId,
      },
      protocolVersion: "a2a.v1",
      receiverAgentId: recruiterParticipant.agentId,
      replyTo: args.sourceEndpoint,
      requestId,
      runId: parentRunContext.runId,
      senderAgentId: gatewayParticipant.agentId,
      sentAt,
      sourceEndpoint: args.sourceEndpoint,
      status: "accepted",
      targetEndpoint: "/api/a2a/agents/recruiter",
      taskType: "candidate_search",
      traceId,
    },
    spanName: "a2a.message.created",
    tags: ["product_flow", "agent:recruiter"],
  });

  await emitA2AProtocolEvent({
    eventName: "a2a.message.sent",
    output: {
      request_id: requestId,
      target_endpoint: "/api/a2a/agents/recruiter",
    },
    protocolContext: {
      authJson: {
        authType: "external_service_bearer",
        authenticatedSenderId: gatewayParticipant.agentId,
        serviceName: gatewayParticipant.name,
      },
      contextJson: {
        callerName: gatewayParticipant.name,
        conversationId: args.conversationId ?? null,
        correlationId: args.correlationId,
        sourceEndpoint: args.sourceEndpoint,
      },
      conversationId: args.conversationId ?? null,
      messageId,
      operation: "candidate_search",
      parentRunId: parentRunContext.runId,
      payloadJson: {
        filters: args.filters ?? null,
        limit: args.limit ?? null,
        organizationId: null,
        prompt: args.prompt,
        userId: args.actorIdentity.appUserId,
      },
      protocolVersion: "a2a.v1",
      receiverAgentId: recruiterParticipant.agentId,
      replyTo: args.sourceEndpoint,
      requestId,
      runId: parentRunContext.runId,
      senderAgentId: gatewayParticipant.agentId,
      sentAt,
      sourceEndpoint: args.sourceEndpoint,
      status: "accepted",
      targetEndpoint: "/api/a2a/agents/recruiter",
      taskType: "candidate_search",
      traceId,
    },
    spanName: "a2a.message.sent",
    tags: ["product_flow", "agent:recruiter"],
  });

  try {
    const bearerToken = getGatewayBearerToken();
    const response = await traceAgentHandoff({
      event: "dispatch",
      input: {
        message_id: messageId,
        request_id: requestId,
        source_endpoint: args.sourceEndpoint,
      },
      invoke: () =>
        handleExternalRecruiterAgentPost(
          new Request("https://career.ai/api/a2a/agents/recruiter", {
            body: JSON.stringify({
              agentType: "recruiter",
              auth: {
                authType: "external_service_bearer",
                authenticatedSenderId: gatewayParticipant.agentId,
                serviceName: gatewayParticipant.name,
              },
              context: {
                callerName: gatewayParticipant.name,
                conversationId: args.conversationId ?? null,
                correlationId: args.correlationId,
                sourceEndpoint: args.sourceEndpoint,
              },
              conversationId: args.conversationId ?? null,
              messageId,
              metadata: {
                callerName: gatewayParticipant.name,
                correlationId: args.correlationId,
              },
              operation: "candidate_search",
              parentRunId: parentRunContext.runId,
              payload: {
                filters: args.filters,
                limit: args.limit,
                organizationId: null,
                prompt: args.prompt,
                userId: args.actorIdentity.appUserId,
              },
              protocolVersion: "a2a.v1",
              receiverAgentId: recruiterParticipant.agentId,
              replyTo: args.sourceEndpoint,
              requestId,
              senderAgentId: gatewayParticipant.agentId,
              sentAt,
              taskType: "candidate_search",
              traceId,
              version: "a2a.v1",
            }),
            headers: {
              authorization: `Bearer ${bearerToken}`,
              "content-type": "application/json",
              "x-correlation-id": args.correlationId,
              "x-request-id": requestId,
              "x-trace-id": traceId,
            },
            method: "POST",
          }),
        ),
      metadata: buildDispatchMetadata({
        actorIdentity: args.actorIdentity,
        childRunId: parentRunContext.runId,
        messageId,
        parentRunId: parentRunContext.runId,
        requestId,
        sourceEndpoint: args.sourceEndpoint,
        taskStatus: "running",
      }),
      output: {
        message_id: messageId,
        request_id: requestId,
      },
      tags: ["external_a2a", "product_flow"],
      type: "task",
    });

    const payload = await response.json();

    if (!response.ok) {
      const parsedError = externalAgentErrorResponseSchema.parse(payload);
      throw new ApiError({
        errorCode: parsedError.error.code,
        status: response.status,
        message: parsedError.error.message,
        details: parsedError.error.details,
        correlationId: parsedError.error.correlationId,
      });
    }

    const parsedSuccess = externalAgentSuccessResponseSchema.parse(payload);

    emitAgentHandoffEvent({
      event: "complete",
      metadata: buildDispatchMetadata({
        actorIdentity: args.actorIdentity,
        childRunId: parsedSuccess.runId,
        messageId,
        parentRunId: parentRunContext.runId,
        requestId,
        sourceEndpoint: args.sourceEndpoint,
        taskStatus: "completed",
      }),
      output: {
        candidate_count:
          "candidates" in (parsedSuccess.result as Record<string, unknown>)
            ? ((parsedSuccess.result as { candidates?: unknown[] }).candidates?.length ?? 0)
            : null,
        request_id: requestId,
        total_matches:
          "totalMatches" in (parsedSuccess.result as Record<string, unknown>)
            ? ((parsedSuccess.result as { totalMatches?: number }).totalMatches ?? null)
            : null,
      },
      tags: ["external_a2a", "product_flow"],
    });

    return parsedSuccess.result as EmployerCandidateSearchResponseDto;
  } catch (error) {
    emitAgentHandoffEvent({
      event: "denied",
      metadata: buildDispatchMetadata({
        actorIdentity: args.actorIdentity,
        messageId,
        parentRunId: parentRunContext.runId,
        requestId,
        sourceEndpoint: args.sourceEndpoint,
        taskStatus: "failed",
      }),
      output: {
        request_id: requestId,
      },
      tags: ["external_a2a", "product_flow"],
    });
    throw error;
  } finally {
    updateRequestTraceContext({
      runId: previousRunId,
    });
  }
}
