import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getPersonaFromRoleType, getPostAuthRoute } from "@/lib/personas";
import { workspaceShellByPersona } from "@/lib/workspace-navigation";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.email) {
    return <>{children}</>;
  }

  const destinationPersona = getPersonaFromRoleType(session.user.roleType);

  if (
    session.user.onboardingStatus === "completed" &&
    destinationPersona === "employer"
  ) {
    redirect(getPostAuthRoute(destinationPersona));
  }

  return (
    <>
      <PersonaPreferenceSync persona="job_seeker" />
      <WorkspaceShell {...workspaceShellByPersona.job_seeker}>{children}</WorkspaceShell>
    </>
  );
}
