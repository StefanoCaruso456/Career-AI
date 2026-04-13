import {
  filterAgentToolRegistry,
  homepageAssistantToolRegistry,
} from "@/packages/agent-runtime/src/tools";
import { candidateAgentRequestSchema } from "@/packages/contracts/src";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import { withTracedRoute } from "@/lib/tracing";
import {
  buildCandidateAgentContext,
  createInternalAgentErrorResponse,
  createInternalAgentResponse,
  resolveInternalAgentRouteContext,
} from "../_shared";

const candidateToolRegistry = filterAgentToolRegistry(homepageAssistantToolRegistry, [
  "search_jobs",
  "get_career_id_summary",
  "get_claim_details",
  "get_verification_record",
  "list_provenance_records",
]);

const candidateInstructions =
  "You are the internal candidate agent for Career AI. Help the candidate using their own Career ID, job search context, and their available verification details. Do not imply recruiter-only access or external verification capabilities that are not present in tool output.";

export const runtime = "nodejs";

async function handleCandidateAgentPost(request: Request) {
  try {
    const routeContext = await resolveInternalAgentRouteContext(
      request,
      "invoke internal candidate agent endpoint",
    );
    const payload = candidateAgentRequestSchema.parse(await request.json());
    const agentContext = await buildCandidateAgentContext({
      correlationId: routeContext.correlationId,
      runContext: routeContext.runContext,
      talentIdentityId: payload.talentIdentityId,
    });
    const result = await generateHomepageAssistantReplyDetailed(payload.message, [], {
      agentContext,
      conversationMessages: payload.messages,
      instructions: candidateInstructions,
      runtimeMode: "bounded_loop",
      toolRegistry: candidateToolRegistry,
      workflowId: "internal_candidate_agent",
    });

    return createInternalAgentResponse({
      correlationId: routeContext.correlationId,
      reply: result.text,
      role: "candidate",
      runId: agentContext.run.runId,
      stepsUsed: result.stepsUsed,
      stopReason: result.stopReason,
      toolCallsUsed: result.toolCallsUsed,
    });
  } catch (error) {
    return createInternalAgentErrorResponse(
      error,
      request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    );
  }
}

export const POST = withTracedRoute(
  {
    name: "http.route.internal.agents.candidate.post",
    tags: ["route:internal_agent", "agent:candidate"],
    type: "task",
  },
  handleCandidateAgentPost,
);
