import { WorkspaceRouteScaffold } from "@/components/workspace-route-scaffold";

export default function EmployerRolesPage() {
  return (
    <WorkspaceRouteScaffold
      cards={[
        {
          eyebrow: "Planning",
          title: "Turn role definitions into structured hiring packets",
          copy:
            "Keep role briefs, evidence requirements, and calibration notes inside a route designed for employer operations from the start.",
        },
        {
          eyebrow: "Alignment",
          title: "Separate role strategy from candidate review",
          copy:
            "Hiring teams can evolve opening-specific workflows here without polluting the overview page or the candidate pipeline route.",
        },
        {
          eyebrow: "Scaffold",
          title: "Make room for employer-only tabs now",
          copy:
            "The roles surface gives the employer client a second major pillar, which is exactly why this route split is worth doing before the UI diverges further.",
        },
      ]}
      description="This route is the employer-owned home for role planning, scorecard setup, and future hiring workflow tabs."
      eyebrow="Employer roles"
      metrics={[
        { label: "Route scope", value: "/employer/roles" },
        { label: "Primary user", value: "Hiring team" },
        { label: "Planning mode", value: "Structured" },
      ]}
      title="Give role planning its own employer surface before the workflow sprawls."
    />
  );
}
