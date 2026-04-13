import { withTracedRoute } from "@/lib/tracing";
import { internalAgentRoleSchema, type InternalAgentRole } from "@/packages/contracts/src";
import {
  createExternalAgentCardResponse,
  createExternalDiscoveryErrorResponse,
  logExternalDiscoveryReceived,
  reserveExternalDiscoveryQuota,
  resolveExternalDiscoveryContext,
} from "../../_shared";

type RouteContext = {
  params: Promise<{
    agentType: string;
  }>;
};

export const runtime = "nodejs";

async function handleExternalAgentCardGet(request: Request, context: RouteContext) {
  let quota = null;
  let discoveryContext: ReturnType<typeof resolveExternalDiscoveryContext> | null = null;

  try {
    const { agentType: rawAgentType } = await context.params;
    const agentType = internalAgentRoleSchema.parse(rawAgentType) as InternalAgentRole;

    discoveryContext = resolveExternalDiscoveryContext(request, agentType);
    quota = reserveExternalDiscoveryQuota({
      agentType,
      caller: discoveryContext.caller,
      correlationId: discoveryContext.correlationId,
      requestId: discoveryContext.requestId,
      resource: `discovery:card:${agentType}`,
      targetId: agentType,
    });

    logExternalDiscoveryReceived({
      caller: discoveryContext.caller,
      correlationId: discoveryContext.correlationId,
      eventType: "external.a2a.discovery.card.received",
      requestId: discoveryContext.requestId,
      targetId: agentType,
    });

    return createExternalAgentCardResponse({
      agentType,
      caller: discoveryContext.caller,
      correlationId: discoveryContext.correlationId,
      quota,
      request,
      requestId: discoveryContext.requestId,
    });
  } catch (error) {
    return createExternalDiscoveryErrorResponse({
      correlationId: discoveryContext?.correlationId ?? crypto.randomUUID(),
      error,
      quota,
    });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const tracedHandler = withTracedRoute(
    {
      name: "http.route.a2a.agents.card.get",
      tags: ["route:a2a", "a2a:card"],
      type: "task",
    },
    (tracedRequest) => handleExternalAgentCardGet(tracedRequest, context),
  );

  return tracedHandler(request);
}
