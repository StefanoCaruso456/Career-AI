import type { AuthenticatedActorIdentity } from "@/actor-identity";
import { createRunContext } from "@/packages/agent-runtime/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import type {
  EmployerCandidateSearchFiltersDto,
  EmployerCandidateSearchResponseDto,
} from "@/packages/contracts/src";
import {
  buildRecruiterAgentContext,
} from "@/app/api/internal/agents/_shared";
import { emitAgentHandoffEvent, traceAgentHandoff } from "@/lib/agent-handoff-tracing";
import { getInternalAgentRouteDefinition } from "@/lib/internal-agents/registry";
import { getRequestTraceContext, traceSpan, updateRequestTraceContext } from "@/lib/tracing";

const recruiterAgentDefinition = getInternalAgentRouteDefinition("recruiter");

export type RecruiterProductSearchDispatchArgs = {
  actorIdentity: AuthenticatedActorIdentity;
  correlationId: string;
  filters?: EmployerCandidateSearchFiltersDto;
  limit?: number;
  prompt: string;
  sourceEndpoint: string;
};

function buildDispatchMetadata(args: {
  actorIdentity: AuthenticatedActorIdentity;
  childRunId?: string | null;
  parentRunId: string;
  sourceEndpoint: string;
  taskStatus?: string | null;
}) {
  return {
    authSubject: args.actorIdentity.id,
    childRunId: args.childRunId ?? null,
    handoffReason: "product_route_delegate",
    handoffType: "internal_agent_dispatch",
    operation: "candidate_search",
    parentRunId: args.parentRunId,
    permissionDecision: "allowed",
    sourceEndpoint: args.sourceEndpoint,
    targetAgentType: recruiterAgentDefinition.agentType,
    targetEndpoint: recruiterAgentDefinition.endpoint,
    taskStatus: args.taskStatus ?? null,
  } as const;
}

export async function searchEmployerCandidatesViaRecruiterAgentBoundary(
  args: RecruiterProductSearchDispatchArgs,
): Promise<EmployerCandidateSearchResponseDto> {
  const requestId = getRequestTraceContext()?.requestId ?? crypto.randomUUID();
  const parentRunContext = createRunContext({
    correlationId: args.correlationId,
  });

  updateRequestTraceContext({
    runId: parentRunContext.runId,
  });

  emitAgentHandoffEvent({
    event: "start",
    metadata: buildDispatchMetadata({
      actorIdentity: args.actorIdentity,
      parentRunId: parentRunContext.runId,
      sourceEndpoint: args.sourceEndpoint,
      taskStatus: "started",
    }),
    output: {
      request_id: requestId,
    },
    tags: ["internal_agent", "product_flow"],
  });

  let agentContext: Awaited<ReturnType<typeof buildRecruiterAgentContext>>;

  try {
    agentContext = await buildRecruiterAgentContext({
      correlationId: args.correlationId,
      runContext: parentRunContext,
      userId:
        args.actorIdentity.appUserId ?? args.actorIdentity.talentIdentityId ?? args.actorIdentity.id,
    });
  } catch (error) {
    emitAgentHandoffEvent({
      event: "denied",
      metadata: buildDispatchMetadata({
        actorIdentity: args.actorIdentity,
        parentRunId: parentRunContext.runId,
        sourceEndpoint: args.sourceEndpoint,
        taskStatus: "denied",
      }),
      output: {
        request_id: requestId,
      },
      tags: ["internal_agent", "product_flow"],
    });
    throw error;
  }

  emitAgentHandoffEvent({
    event: "authz",
    metadata: buildDispatchMetadata({
      actorIdentity: args.actorIdentity,
      childRunId: agentContext.run.runId,
      parentRunId: parentRunContext.runId,
      sourceEndpoint: args.sourceEndpoint,
    }),
    output: {
      recruiter_role_type: agentContext.roleType,
      request_id: requestId,
    },
    tags: ["internal_agent", "product_flow"],
  });

  const startedAt = Date.now();
  const result = await traceAgentHandoff({
    event: "dispatch",
    input: {
      filters: args.filters ?? null,
      limit: args.limit ?? null,
      prompt: args.prompt,
      request_id: requestId,
      source_endpoint: args.sourceEndpoint,
    },
    invoke: () =>
      traceSpan(
        {
          metadata: {
            actor_identity_id: args.actorIdentity.id,
            actor_role_type: args.actorIdentity.roleType,
            endpoint: recruiterAgentDefinition.endpoint,
            operation: "candidate_search",
            request_id: requestId,
            source_endpoint: args.sourceEndpoint,
          },
          metrics: () => ({
            duration_ms: Date.now() - startedAt,
          }),
          name: "internal.agent.recruiter.candidate_search",
          tags: [
            "internal_agent",
            "product_flow",
            "agent:recruiter",
            "operation:candidate_search",
          ],
          type: "task",
        },
        () =>
          searchEmployerCandidates({
            filters: args.filters,
            limit: args.limit,
            prompt: args.prompt,
          }),
      ),
    metadata: buildDispatchMetadata({
      actorIdentity: args.actorIdentity,
      childRunId: agentContext.run.runId,
      parentRunId: parentRunContext.runId,
      sourceEndpoint: args.sourceEndpoint,
      taskStatus: "running",
    }),
    metrics: () => ({
      duration_ms: Date.now() - startedAt,
    }),
    output: (value: EmployerCandidateSearchResponseDto) => ({
      candidate_count: value.candidates.length,
      request_id: requestId,
      total_matches: value.totalMatches,
    }),
    tags: ["internal_agent", "product_flow"],
    type: "task",
  });

  emitAgentHandoffEvent({
    event: "complete",
    metadata: buildDispatchMetadata({
      actorIdentity: args.actorIdentity,
      childRunId: agentContext.run.runId,
      parentRunId: parentRunContext.runId,
      sourceEndpoint: args.sourceEndpoint,
      taskStatus: "completed",
    }),
    output: {
      candidate_count: result.candidates.length,
      request_id: requestId,
      total_matches: result.totalMatches,
    },
    tags: ["internal_agent", "product_flow"],
  });

  return result;
}
