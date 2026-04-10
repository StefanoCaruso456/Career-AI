import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { ChatHomeShell } from "@/components/chat-home-shell";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { getPersonaSignInRoute } from "@/lib/personas";

export default async function EmployerPage() {
  const session = await auth();

  if (!session?.user) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: "/employer",
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
    correlationId: `employer_page_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
  });

  return (
    <>
      <PersonaPreferenceSync persona="employer" />
      <ChatHomeShell persona="employer" />
    </>
  );
}
