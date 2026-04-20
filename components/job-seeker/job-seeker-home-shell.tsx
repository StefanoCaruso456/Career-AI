import { getAutonomousApplyAvailability } from "@/packages/apply-domain/src";
import { ChatHomeShell } from "@/components/chat-home-shell";
import { landingContentByPersona } from "@/components/chat-home-shell-content";

export function JobSeekerHomeShell() {
  return (
    <ChatHomeShell
      autonomousApplyEnabled={getAutonomousApplyAvailability().canQueueRuns}
      content={landingContentByPersona.job_seeker}
      persona="job_seeker"
    />
  );
}
