import { WorkspaceRouteScaffold } from "@/components/workspace-route-scaffold";

export default function EmployerAgentSorcererPage() {
  return (
    <WorkspaceRouteScaffold
      cards={[
        {
          eyebrow: "Agent identity",
          title: "Create employer-side agents with their own structured Agent ID",
          copy:
            "Use this route to define the employer's hiring agent, its trust posture, and the identity surface that powers downstream workflow decisions.",
        },
        {
          eyebrow: "Workflow orchestration",
          title: "Turn recruiting tasks into reusable agent-led operations",
          copy:
            "Screening support, verification checks, and candidate coordination can live here once the employer client starts owning its own automation stack.",
        },
        {
          eyebrow: "Employer client",
          title: "Keep agent creation inside the business workspace from the start",
          copy:
            "This tab gives employers their own place to build Agent Sorcerer without borrowing the job seeker-facing Career ID route or public navigation language.",
        },
      ]}
      description="This route is reserved for the employer-side Agent Sorcerer workflow, where businesses can create an agent identity and grow employer-specific automation over time."
      eyebrow="Employer agent builder"
      metrics={[
        { label: "Route scope", value: "/employer/agent-sorcerer" },
        { label: "Primary user", value: "Employer team" },
        { label: "Core outcome", value: "Agent creation" },
      ]}
      title="Give employers a dedicated Agent Sorcerer surface inside their own client."
    />
  );
}
