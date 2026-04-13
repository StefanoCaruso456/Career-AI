import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getPersistentCareerIdentityForSessionUser } from "@/auth-identity";
import { isDatabaseConfigured } from "@/packages/persistence/src";
import type { Persona } from "./personas";
import { getPersona } from "./personas";
import {
  getPreferredPersonaFromCookieString,
  preferredPersonaCookieName,
} from "./persona-preference";

function isServerPersonaPreferenceEnabled() {
  const configuredValue = process.env.PERSIST_SERVER_PERSONA_PREFERENCE?.trim();

  if (configuredValue === "0" || configuredValue === "false") {
    return false;
  }

  return true;
}

export async function getServerPreferredPersona(): Promise<Persona> {
  const cookieStore = await cookies();
  const cookiePersona = getPreferredPersonaFromCookieString(
    cookieStore
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; "),
  );

  if (!isServerPersonaPreferenceEnabled() || !isDatabaseConfigured()) {
    return cookiePersona;
  }

  const session = await auth();

  if (!session?.user) {
    return cookiePersona;
  }

  try {
    const context = await getPersistentCareerIdentityForSessionUser({
      user: {
        appUserId: session.user.appUserId,
        authProvider: session.user.authProvider,
        email: session.user.email,
        image: session.user.image,
        name: session.user.name,
        providerUserId: session.user.providerUserId,
      },
      correlationId:
        `server_persona_preference_${session.user.appUserId ?? session.user.email ?? "unknown"}`,
    });
    const persistedPersona = context.user.preferredPersona;

    if (persistedPersona) {
      return getPersona(persistedPersona);
    }
  } catch {
    return cookiePersona;
  }

  return getPersona(cookieStore.get(preferredPersonaCookieName)?.value ?? cookiePersona);
}
