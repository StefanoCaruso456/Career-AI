import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getPersonaFromRoleType,
  getPersonaSignInRoute,
  getSettingsRoute,
} from "@/lib/personas";
import { getServerPreferredPersona } from "@/lib/server-persona-preference";

export default async function SettingsPage() {
  const session = await auth();
  const preferredPersona =
    getPersonaFromRoleType(session?.user?.roleType) ?? (await getServerPreferredPersona());
  const settingsHref = getSettingsRoute(preferredPersona);

  if (!session?.user?.email) {
    redirect(
      getPersonaSignInRoute({
        callbackUrl: settingsHref,
        persona: preferredPersona,
      }),
    );
  }

  redirect(settingsHref);
}
