import { ChatHomeShell } from "@/components/chat-home-shell";
import { landingContentByPersona } from "@/components/chat-home-shell-content";

export function JobSeekerHomeShell() {
  return <ChatHomeShell content={landingContentByPersona.job_seeker} persona="job_seeker" />;
}
