import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getPersonaSignInRoute,
  getSettingsRoute,
  resolveActivePersona,
} from "@/lib/personas";
import { getServerPreferredPersona } from "@/lib/server-persona-preference";

export default async function SettingsPage() {
  const preferredPersona = await getServerPreferredPersona();
  const session = await auth();
  const activePersona = resolveActivePersona({
    preferredPersona,
    roleType: session?.user?.roleType,
    route: "/settings",
  });
  const settingsRoute = getSettingsRoute(activePersona);

  if (!session?.user) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: settingsRoute,
        persona: activePersona,
      }),
    );
  }

  redirect(settingsRoute);
}
