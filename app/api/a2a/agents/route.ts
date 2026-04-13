import { withTracedRoute } from "@/lib/tracing";
import { isExternalAgentAuthorizedForAgent } from "@/lib/a2a/auth";
import { internalAgentRoleSchema } from "@/packages/contracts/src";
import {
  createExternalDiscoveryErrorResponse,
  createExternalDiscoveryListResponse,
  logExternalDiscoveryReceived,
  reserveExternalDiscoveryQuota,
  resolveExternalDiscoveryContext,
} from "./_shared";

export const runtime = "nodejs";

async function handleExternalAgentDiscovery(request: Request) {
  let quota = null;
  let discoveryContext: ReturnType<typeof resolveExternalDiscoveryContext> | null = null;

  try {
    discoveryContext = resolveExternalDiscoveryContext(request);
    quota = reserveExternalDiscoveryQuota({
      caller: discoveryContext.caller,
      correlationId: discoveryContext.correlationId,
      requestId: discoveryContext.requestId,
      resource: "discovery:list",
      targetId: "external_agent_list",
    });

    logExternalDiscoveryReceived({
      caller: discoveryContext.caller,
      correlationId: discoveryContext.correlationId,
      eventType: "external.a2a.discovery.list.received",
      requestId: discoveryContext.requestId,
      targetId: "external_agent_list",
    });

    const visibleAgentTypes = internalAgentRoleSchema.options.filter((agentType) =>
      isExternalAgentAuthorizedForAgent(discoveryContext!.caller, agentType),
    );

    return createExternalDiscoveryListResponse({
      caller: discoveryContext.caller,
      correlationId: discoveryContext.correlationId,
      quota,
      request,
      requestId: discoveryContext.requestId,
      visibleAgentTypes,
    });
  } catch (error) {
    return createExternalDiscoveryErrorResponse({
      correlationId: discoveryContext?.correlationId ?? crypto.randomUUID(),
      error,
      quota,
    });
  }
}

export const GET = withTracedRoute(
  {
    name: "http.route.a2a.agents.discovery.get",
    tags: ["route:a2a", "a2a:discovery"],
    type: "task",
  },
  handleExternalAgentDiscovery,
);
