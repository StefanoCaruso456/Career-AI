import type { Persona } from "./personas";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type WorkspaceShellConfig = {
  eyebrow: string;
  summary: string;
  tabs: WorkspaceNavItem[];
};

export const workspaceShellByPersona: Record<Persona, WorkspaceShellConfig> = {
  employer: {
    eyebrow: "Employer client",
    summary:
      "Keep hiring review, agent orchestration, role planning, and employer settings in a dedicated workspace under /employer/*.",
    tabs: [
      { href: "/employer", label: "Overview" },
      { href: "/employer/candidates", label: "Candidates" },
      { href: "/employer/agent-sorcerer", label: "Agent Sorcerer" },
      { href: "/employer/roles", label: "Roles" },
      { href: "/employer/settings", label: "Settings" },
    ],
  },
  job_seeker: {
    eyebrow: "Job seeker client",
    summary:
      "Anchor your authenticated workspace inside /account/* while the broader Career AI surfaces continue to evolve around it.",
    tabs: [
      { href: "/account", label: "Overview" },
      { href: "/account/access-requests", label: "Access requests" },
      { href: "/account/settings", label: "Settings" },
    ],
  },
};
