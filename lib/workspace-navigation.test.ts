import { describe, expect, it } from "vitest";
import { workspaceShellByPersona } from "@/lib/workspace-navigation";

describe("workspaceShellByPersona", () => {
  it("keeps Agent Sorcerer inside the employer client tabs", () => {
    expect(workspaceShellByPersona.employer.tabs).toContainEqual({
      href: "/employer/agent-sorcerer",
      label: "Agent Sorcerer",
    });
  });

  it("does not rename the shared job seeker builder tab through employer nav config", () => {
    expect(
      workspaceShellByPersona.job_seeker.tabs.some((tab) => tab.label === "Agent Sorcerer"),
    ).toBe(false);
  });

  it("keeps route implementation details out of workspace shell copy", () => {
    expect(workspaceShellByPersona.job_seeker.summary).not.toContain("/account/*");
    expect(workspaceShellByPersona.employer.summary).not.toContain("/employer/*");
  });
});
