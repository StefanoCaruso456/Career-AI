import { WorkspaceRouteScaffold } from "@/components/workspace-route-scaffold";

export default function AccountSettingsPage() {
  return (
    <WorkspaceRouteScaffold
      cards={[
        {
          eyebrow: "Profile type",
          title: "Persist job seeker identity cleanly",
          copy:
            "This surface is ready to read the saved persona record once profile persistence becomes the source of truth for routing and defaults.",
        },
        {
          eyebrow: "Sharing",
          title: "Control how trust proof leaves the workspace",
          copy:
            "Keep future export, recruiter visibility, and verification-sharing preferences in one account-owned settings surface.",
        },
        {
          eyebrow: "Preferences",
          title: "Separate user controls from employer workflows",
          copy:
            "Job seeker-specific defaults can now evolve here without colliding with the employer client navigation or settings model.",
        },
      ]}
      description="This account-owned settings route is the first dedicated /account/* settings surface, so future profile and privacy controls have a clean home."
      eyebrow="Job seeker settings"
      metrics={[
        { label: "Persona source", value: "Profile-ready" },
        { label: "Auth flow", value: "Google" },
        { label: "Route scope", value: "/account/*" },
      ]}
      title="Keep account controls inside the job seeker client."
    />
  );
}
