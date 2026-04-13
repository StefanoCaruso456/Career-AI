import { describe, expect, it } from "vitest";
import {
  getExternalAgentCard,
  getExternalAgentRouteDefinition,
  listExternalAgentCards,
} from "./registry";

describe("a2a registry", () => {
  it("derives external cards from the internal agent card foundation", () => {
    const recruiterDefinition = getExternalAgentRouteDefinition("recruiter");
    const recruiterCard = getExternalAgentCard("recruiter", {
      baseUrl: "https://career.ai",
    });
    const listedCards = listExternalAgentCards({
      baseUrl: "https://career.ai",
    });

    expect(recruiterDefinition.endpointPath).toBe("/api/a2a/agents/recruiter");
    expect(recruiterCard).toMatchObject({
      agentType: "recruiter",
      endpoint: "https://career.ai/api/a2a/agents/recruiter",
      requiredAuthType: "external_service_bearer",
      supportedProtocolVersions: ["a2a.v1"],
    });
    expect(listedCards.map((card) => card.agentType)).toEqual([
      "candidate",
      "recruiter",
      "verifier",
    ]);
  });
});
