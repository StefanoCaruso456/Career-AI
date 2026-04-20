import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

  return (
    <>
      <PersonaPreferenceSync persona="employer" />
      {children}
    </>
  );
}
