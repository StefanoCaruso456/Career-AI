import { ChatHomeShell } from "@/components/chat-home-shell";
import { landingContentByPersona } from "@/components/chat-home-shell-content";

export function EmployerHomeShell() {
  return (
    <ChatHomeShell
      content={landingContentByPersona.employer}
      embeddedInWorkspaceShell
    />
  );
}
