import { withTracedRoute } from "@/lib/tracing";
import { defaultW3CPresentationAdapter } from "@/packages/agent-runtime/src";
import {
  filterAgentToolRegistry,
  homepageAssistantToolRegistry,
} from "@/packages/agent-runtime/src/tools";
import { verifierAgentRequestSchema } from "@/packages/contracts/src";
import { generateHomepageAssistantReplyDetailed } from "@/packages/homepage-assistant/src";
import {
  buildVerifierAgentContext,
  createInternalAgentErrorResponse,
  createInternalAgentResponse,
  resolveInternalAgentRouteContext,
} from "../_shared";

const verifierToolRegistry = filterAgentToolRegistry(homepageAssistantToolRegistry, [
  "get_claim_details",
  "get_verification_record",
  "list_provenance_records",
  "get_career_id_summary",
]);

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

const verifierInstructions =
  "You are the internal verifier agent for Career AI. Focus on claims, verification records, provenance, and trustworthy evidence handling. Treat any W3C presentation summary as advisory internal context only, and do not claim external verification that has not happened.";

export const runtime = "nodejs";

async function handleVerifierAgentPost(request: Request) {
  try {
    const routeContext = await resolveInternalAgentRouteContext(
      request,
      "invoke internal verifier agent endpoint",
    );
    const payload = verifierAgentRequestSchema.parse(await request.json());
    const agentContext = buildVerifierAgentContext({
      runContext: routeContext.runContext,
      serviceActor: routeContext.serviceActor,
    });
    const presentationSummary = defaultW3CPresentationAdapter.summarize(
      payload.presentation ?? null,
    );
    const result = await generateHomepageAssistantReplyDetailed(payload.message, [], {
      agentContext,
      contextPreamble: buildPresentationContextPreamble(presentationSummary),
      conversationMessages: payload.messages,
      instructions: verifierInstructions,
      runtimeMode: "bounded_loop",
      toolRegistry: verifierToolRegistry,
      workflowId: "internal_verifier_agent",
    });

    return createInternalAgentResponse({
      correlationId: routeContext.correlationId,
      presentationSummary,
      reply: result.text,
      role: "verifier",
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
    name: "http.route.internal.agents.verifier.post",
    tags: ["route:internal_agent", "agent:verifier"],
    type: "task",
  },
  handleVerifierAgentPost,
);
