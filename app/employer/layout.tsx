import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { getPersonaSignInRoute, getPostAuthRoute } from "@/lib/personas";

export default async function EmployerLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.email) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: getPostAuthRoute("employer"),
        persona: "employer",
      }),
    );
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
    correlationId: `employer_layout_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  return (
    <>
      <PersonaPreferenceSync persona="employer" />
      {children}
    </>
  );
}
