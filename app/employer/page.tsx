import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChatHomeShell } from "@/components/chat-home-shell";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { hasIncompleteOnboarding } from "@/lib/authenticated-workspace";
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

  if (hasIncompleteOnboarding(session.user.onboardingStatus)) {
    redirect("/onboarding");
  }

  return (
    <>
      <PersonaPreferenceSync persona="employer" />
      <ChatHomeShell persona="employer" />
    </>
  );
}
