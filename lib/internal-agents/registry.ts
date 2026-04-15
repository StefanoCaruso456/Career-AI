import {
  internalAgentCardSchema,
  type InternalAgentCard,
  type InternalAgentRole,
} from "@/packages/contracts/src";

export type InternalAgentRouteDefinition = InternalAgentCard & {
  action: string;
  endpoint: string;
  instructions: string;
  operation: "respond" | "candidate_search";
  workflowId: string;
};

const internalAgentRouteDefinitions = {
  candidate: internalAgentCardSchema.parse({
    agentId: "careerai.agent.candidate",
    agentType: "candidate",
    allowedTools: [
      "search_jobs",
      "get_career_id_summary",
      "get_claim_details",
      "get_verification_record",
      "list_provenance_records",
    ],
    capabilities: [
      {
        description: "Answer candidate questions using owned Career ID context and job search tools.",
        name: "career_guidance",
      },
      {
        description: "Summarize owned verification records and provenance details.",
        name: "verification_summary",
      },
      {
        description: "Run read-only job search against the current jobs domain.",
        name: "job_search",
      },
    ],
    name: "Career AI Candidate Agent",
    requiredAuthType: "internal_service_bearer",
    role: "candidate",
    supportedOperations: ["respond"],
    supportedRequestVersions: ["v1"],
    supportedResponseVersions: ["v1"],
  }),
  recruiter: internalAgentCardSchema.parse({
    agentId: "careerai.agent.recruiter",
    agentType: "recruiter",
    allowedTools: [
      "search_jobs",
      "get_career_id_summary",
      "search_candidates",
      "get_claim_details",
      "get_verification_record",
      "list_provenance_records",
    ],
    capabilities: [
      {
        description: "Support recruiter-safe sourcing and candidate search workflows.",
        name: "candidate_search",
      },
      {
        description: "Use scoped Career ID and verification details when permissions allow it.",
        name: "permission_scoped_review",
      },
      {
        description: "Ground recruiter responses in active organization context.",
        name: "organization_context",
      },
    ],
    name: "Career AI Recruiter Agent",
    requiredAuthType: "internal_service_bearer",
    role: "recruiter",
    supportedOperations: ["respond", "candidate_search"],
    supportedRequestVersions: ["v1"],
    supportedResponseVersions: ["v1"],
  }),
  verifier: internalAgentCardSchema.parse({
    agentId: "careerai.agent.verifier",
    agentType: "verifier",
    allowedTools: [
      "get_claim_details",
      "get_verification_record",
      "list_provenance_records",
      "get_career_id_summary",
    ],
    capabilities: [
      {
        description: "Inspect claims, verification records, and provenance in read-only mode.",
        name: "verification_review",
      },
      {
        description: "Accept W3C presentation metadata through an internal adapter seam.",
        name: "w3c_presentation_context",
      },
    ],
    name: "Career AI Verifier Agent",
    requiredAuthType: "internal_service_bearer",
    role: "verifier",
    supportedOperations: ["respond"],
    supportedRequestVersions: ["v1"],
    supportedResponseVersions: ["v1"],
  }),
} satisfies Record<InternalAgentRole, InternalAgentCard>;

const internalAgentRouteConfig = {
  candidate: {
    action: "invoke internal candidate agent endpoint",
    endpoint: "/api/internal/agents/candidate",
    instructions:
      "You are the internal candidate agent for Career AI. Help the candidate using their own Career ID, job search context, and their available verification details. Do not imply recruiter-only access or external verification capabilities that are not present in tool output.",
    operation: "respond",
    workflowId: "internal_candidate_agent",
  },
  recruiter: {
    action: "invoke internal recruiter agent endpoint",
    endpoint: "/api/internal/agents/recruiter",
    instructions:
      "You are the internal recruiter agent for Career AI. Focus on recruiter-safe sourcing, public/shared candidate context, and access-controlled verification details only when server-side permissions allow them. Do not imply access based on persona alone.",
    operation: "respond",
    workflowId: "internal_recruiter_agent",
  },
  verifier: {
    action: "invoke internal verifier agent endpoint",
    endpoint: "/api/internal/agents/verifier",
    instructions:
      "You are the internal verifier agent for Career AI. Focus on claims, verification records, provenance, and trustworthy evidence handling. Treat any W3C presentation summary as advisory internal context only, and do not claim external verification that has not happened.",
    operation: "respond",
    workflowId: "internal_verifier_agent",
  },
} satisfies Record<
  InternalAgentRole,
  Pick<InternalAgentRouteDefinition, "action" | "endpoint" | "instructions" | "operation" | "workflowId">
>;

export function getInternalAgentRouteDefinition(
  agentType: InternalAgentRole,
): InternalAgentRouteDefinition {
  return {
    ...internalAgentRouteDefinitions[agentType],
    ...internalAgentRouteConfig[agentType],
  };
}

export function listInternalAgentRouteDefinitions(): InternalAgentRouteDefinition[] {
  return (Object.keys(internalAgentRouteDefinitions) as InternalAgentRole[]).map((agentType) =>
    getInternalAgentRouteDefinition(agentType),
  );
}
