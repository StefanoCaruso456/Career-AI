import { describe, expect, it } from "vitest";
import {
  getInternalAgentRouteDefinition,
  listInternalAgentRouteDefinitions,
} from "./registry";

describe("internal agent registry", () => {
  it("describes candidate, recruiter, and verifier agents with versioned capability metadata", () => {
    const definitions = listInternalAgentRouteDefinitions();

    expect(definitions).toHaveLength(3);
    expect(definitions.map((definition) => definition.agentType)).toEqual([
      "candidate",
      "recruiter",
      "verifier",
    ]);

    expect(getInternalAgentRouteDefinition("candidate")).toMatchObject({
      allowedTools: expect.arrayContaining(["search_jobs", "get_career_id_summary"]),
      operation: "respond",
      requiredAuthType: "internal_service_bearer",
      supportedRequestVersions: ["v1"],
      supportedResponseVersions: ["v1"],
    });
    expect(getInternalAgentRouteDefinition("recruiter").capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "candidate_search",
        }),
      ]),
    );
    expect(getInternalAgentRouteDefinition("verifier").endpoint).toBe(
      "/api/internal/agents/verifier",
    );
  });
});
