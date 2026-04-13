import { describe, expect, it } from "vitest";
import { workspaceShellByPersona } from "@/lib/workspace-navigation";

describe("workspaceShellByPersona", () => {
  it("keeps Candidates inside the employer workspace tabs", () => {
    expect(workspaceShellByPersona.employer.tabs).toContainEqual({
      href: "/employer/candidates",
      label: "Candidates",
    });
  });

  it("does not keep the retired Agent Sorcerer tab in employer or job seeker nav", () => {
    expect(workspaceShellByPersona.employer.tabs.some((tab) => tab.label === "Agent Sorcerer")).toBe(
      false,
    );
    expect(workspaceShellByPersona.job_seeker.tabs.some((tab) => tab.label === "Agent Sorcerer")).toBe(
      false,
    );
  });

  it("keeps route implementation details out of workspace shell copy", () => {
    expect(workspaceShellByPersona.job_seeker.summary).not.toContain("/account/*");
    expect(workspaceShellByPersona.employer.summary).not.toContain("/employer/*");
  });
});
