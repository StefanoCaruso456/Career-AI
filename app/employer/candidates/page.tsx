import { WorkspaceRouteScaffold } from "@/components/workspace-route-scaffold";

export default function EmployerCandidatesPage() {
  return (
    <WorkspaceRouteScaffold
      cards={[
        {
          eyebrow: "Review lanes",
          title: "Shape the candidate intake surface around proof",
          copy:
            "Use this route for recruiter-safe queues, candidate trust summaries, and evidence-backed review states as employer workflows deepen.",
        },
        {
          eyebrow: "Verification",
          title: "Bring credibility checks into the first-pass screen",
          copy:
            "This route is positioned to hold claim review, provenance reads, and fast credibility shortcuts without crowding the employer home.",
        },
        {
          eyebrow: "Collaboration",
          title: "Give recruiters and hiring managers the same read model",
          copy:
            "Shared notes, reviewer context, and aligned next steps can live here as the employer client starts owning the hiring journey.",
        },
      ]}
      description="This route is reserved for the employer-side candidate surface, so the business client can grow review workflows without borrowing job seeker navigation patterns."
      eyebrow="Employer candidates"
      metrics={[
        { label: "Future review lanes", value: "3+" },
        { label: "Signal source", value: "Evidence-backed" },
        { label: "Primary outcome", value: "Faster screening" },
      ]}
      title="Build the candidate review client in its own employer route."
    />
  );
}
