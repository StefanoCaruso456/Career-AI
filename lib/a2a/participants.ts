import type { AgentId, InternalAgentRole } from "@/packages/contracts/src";
import { getInternalAgentRouteDefinition } from "@/lib/internal-agents/registry";

export type A2AProtocolParticipant = {
  agentId: AgentId;
  agentType: InternalAgentRole | null;
  authSubject: string;
  kind: "agent" | "external_service" | "gateway";
  name: string;
};

const employerSearchGatewayParticipant = {
  agentId: "careerai.gateway.employer_search",
  agentType: null,
  authSubject: "service:careerai.gateway.employer_search",
  kind: "gateway",
  name: "Career AI Employer Search Gateway",
} satisfies A2AProtocolParticipant;

export function getEmployerSearchGatewayParticipant(): A2AProtocolParticipant {
  return employerSearchGatewayParticipant;
}

export function getA2AProtocolParticipantForAgent(agentType: InternalAgentRole): A2AProtocolParticipant {
  const definition = getInternalAgentRouteDefinition(agentType);

  return {
    agentId: definition.agentId,
    agentType: definition.agentType,
    authSubject: `service:${definition.agentId}`,
    kind: "agent",
    name: definition.name,
  };
}

export function getA2AProtocolParticipantForExternalService(serviceActorId: string, serviceName: string) {
  return {
    agentId: `external_service:${serviceActorId}` as AgentId,
    agentType: null,
    authSubject: `service:${serviceActorId}`,
    kind: "external_service",
    name: serviceName,
  } satisfies A2AProtocolParticipant;
}

export function resolveA2AProtocolParticipant(agentId: string): A2AProtocolParticipant | null {
  if (agentId === employerSearchGatewayParticipant.agentId) {
    return employerSearchGatewayParticipant;
  }

  for (const agentType of ["candidate", "recruiter", "verifier"] as const) {
    const participant = getA2AProtocolParticipantForAgent(agentType);

    if (participant.agentId === agentId) {
      return participant;
    }
  }

  if (agentId.startsWith("external_service:")) {
    const serviceActorId = agentId.slice("external_service:".length);

    if (!serviceActorId) {
      return null;
    }

    return {
      agentId: agentId as AgentId,
      agentType: null,
      authSubject: `service:${serviceActorId}`,
      kind: "external_service",
      name: serviceActorId,
    };
  }

  return null;
}
