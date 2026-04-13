import {
  externalAgentCardSchema,
  type ExternalAgentCard,
  type InternalAgentRole,
} from "@/packages/contracts/src";
import {
  getInternalAgentRouteDefinition,
  listInternalAgentRouteDefinitions,
  type InternalAgentRouteDefinition,
} from "@/lib/internal-agents/registry";

export type ExternalAgentRouteDefinition = Omit<
  InternalAgentRouteDefinition,
  "endpoint" | "requiredAuthType"
> & {
  cardPath: string;
  endpointPath: string;
  requiredAuthType: "external_service_bearer";
};

function normalizeBaseUrl(baseUrl?: string | null) {
  const normalizedBaseUrl = baseUrl?.trim();

  if (!normalizedBaseUrl) {
    return null;
  }

  return normalizedBaseUrl.endsWith("/")
    ? normalizedBaseUrl.slice(0, -1)
    : normalizedBaseUrl;
}

function buildExternalUrl(baseUrl: string | null, path: string) {
  if (!baseUrl) {
    return path;
  }

  return `${baseUrl}${path}`;
}

export function getExternalAgentRouteDefinition(
  agentType: InternalAgentRole,
): ExternalAgentRouteDefinition {
  const internalDefinition = getInternalAgentRouteDefinition(agentType);

  return {
    action: `invoke external ${agentType} agent endpoint`,
    agentType: internalDefinition.agentType,
    allowedTools: internalDefinition.allowedTools,
    capabilities: internalDefinition.capabilities,
    cardPath: `/api/a2a/agents/${agentType}/card`,
    endpointPath: `/api/a2a/agents/${agentType}`,
    instructions: internalDefinition.instructions,
    name: internalDefinition.name,
    operation: internalDefinition.operation,
    requiredAuthType: "external_service_bearer",
    role: internalDefinition.role,
    supportedOperations: internalDefinition.supportedOperations,
    supportedRequestVersions: internalDefinition.supportedRequestVersions,
    supportedResponseVersions: internalDefinition.supportedResponseVersions,
    workflowId: internalDefinition.workflowId,
  };
}

export function getExternalAgentCard(
  agentType: InternalAgentRole,
  options?: { baseUrl?: string | null },
): ExternalAgentCard {
  const definition = getExternalAgentRouteDefinition(agentType);
  const baseUrl = normalizeBaseUrl(options?.baseUrl ?? null);

  return externalAgentCardSchema.parse({
    agentType: definition.agentType,
    capabilities: definition.capabilities,
          endpoint: buildExternalUrl(baseUrl, definition.endpointPath),
          name: definition.name,
          requiredAuthType: definition.requiredAuthType,
    role: definition.role,
    supportedOperations: definition.supportedOperations,
    supportedProtocolVersions: ["a2a.v1"],
    supportedRequestVersions: ["a2a.v1"],
    supportedResponseVersions: ["a2a.v1"],
  });
}

export function listExternalAgentCards(options?: { baseUrl?: string | null }) {
  const baseUrl = normalizeBaseUrl(options?.baseUrl ?? null);

  return listInternalAgentRouteDefinitions().map((definition) =>
    getExternalAgentCard(definition.agentType, {
      baseUrl,
    }),
  );
}
