import { WorkspaceRouteScaffold } from "@/components/workspace-route-scaffold";

export default function EmployerSettingsPage() {
  return (
    <WorkspaceRouteScaffold
      cards={[
        {
          eyebrow: "Team access",
          title: "Own employer permissions in the employer client",
          copy:
            "Seat management, reviewer roles, and workspace-level defaults should belong to the employer route tree rather than the job seeker account surface.",
        },
        {
          eyebrow: "Policy",
          title: "Keep hiring controls close to the employer workflow",
          copy:
            "Verification rules, export defaults, and screening preferences can grow here without becoming mixed-persona account settings.",
        },
        {
          eyebrow: "Persistence",
          title: "Connect profile type to employer workspace defaults",
          copy:
            "Once persona is stored on the user profile, this route can read that canonical state and configure the employer client automatically.",
        },
      ]}
      description="This dedicated settings route keeps employer policies, team access, and future business controls inside the employer client instead of mixing them into account settings."
      eyebrow="Employer settings"
      metrics={[
        { label: "Persona scope", value: "Employer" },
        { label: "Team model", value: "Multi-user ready" },
        { label: "Future source", value: "Profile-backed" },
      ]}
      title="Hold employer controls in a workspace that is actually employer-owned."
    />
  );
}
