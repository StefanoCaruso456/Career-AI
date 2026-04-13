import type { ReactNode } from "react";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { WorkspaceShell } from "@/components/workspace-shell";
import { workspaceShellByPersona } from "@/lib/workspace-navigation";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.email) {
    return <>{children}</>;
  }

  await ensurePersistentCareerIdentityForSessionUser({
    user: {
      appUserId: session.user.appUserId,
      authProvider: session.user.authProvider,
      email: session.user.email,
      image: session.user.image,
      name: session.user.name,
      providerUserId: session.user.providerUserId,
    },
    correlationId: `account_layout_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  return (
    <>
      <PersonaPreferenceSync persona="job_seeker" />
      <WorkspaceShell {...workspaceShellByPersona.job_seeker}>{children}</WorkspaceShell>
    </>
  );
}
