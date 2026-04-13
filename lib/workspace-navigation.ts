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
    eyebrow: "Hiring workspace",
    summary:
      "Review candidates, manage roles, and run hiring workflows from one employer workspace.",
    tabs: [
      { href: "/employer", label: "Overview" },
      { href: "/employer/candidates", label: "Candidates" },
      { href: "/employer/roles", label: "Roles" },
      { href: "/employer/settings", label: "Settings" },
    ],
  },
  job_seeker: {
    eyebrow: "Career workspace",
    summary:
      "Manage your Career ID, access requests, and account settings from one workspace.",
    tabs: [
      { href: "/account", label: "Overview" },
      { href: "/account/access-requests", label: "Access requests" },
      { href: "/account/settings", label: "Settings" },
    ],
  },
};
