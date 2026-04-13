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
  resolveInternalAgentRouteContext,
} from "../_shared";

const recruiterToolRegistry = filterAgentToolRegistry(homepageAssistantToolRegistry, [
  "search_jobs",
  "get_career_id_summary",
  "search_candidates",
  "get_claim_details",
  "get_verification_record",
  "list_provenance_records",
]);

const recruiterInstructions =
  "You are the internal recruiter agent for Career AI. Focus on recruiter-safe sourcing, public/shared candidate context, and access-controlled verification details only when server-side permissions allow them. Do not imply access based on persona alone.";

export const runtime = "nodejs";

async function handleRecruiterAgentPost(request: Request) {
  try {
    const routeContext = await resolveInternalAgentRouteContext(
      request,
      "invoke internal recruiter agent endpoint",
    );
    const payload = recruiterAgentRequestSchema.parse(await request.json());
    const agentContext = await buildRecruiterAgentContext({
      correlationId: routeContext.correlationId,
      organizationId: payload.organizationId,
      runContext: routeContext.runContext,
      userId: payload.userId,
    });
    const result = await generateHomepageAssistantReplyDetailed(payload.message, [], {
      agentContext,
      conversationMessages: payload.messages,
      instructions: recruiterInstructions,
      runtimeMode: "bounded_loop",
      toolRegistry: recruiterToolRegistry,
      workflowId: "internal_recruiter_agent",
    });

    return createInternalAgentResponse({
      correlationId: routeContext.correlationId,
      reply: result.text,
      role: "recruiter",
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
    name: "http.route.internal.agents.recruiter.post",
    tags: ["route:internal_agent", "agent:recruiter"],
    type: "task",
  },
  handleRecruiterAgentPost,
);
