import { defaultPersona, getPersona, type Persona } from "./personas";

export const preferredPersonaStorageKey = "career-ai.preferred-persona";
export const preferredPersonaCookieName = "career-ai-preferred-persona";

const preferredPersonaCookieMaxAgeSeconds = 60 * 60 * 24 * 365;

export function getPreferredPersonaFromCookieString(cookieString: string | null | undefined) {
  if (!cookieString) {
    return defaultPersona;
  }

  const personaCookie = cookieString
    .split(";")
    .map((cookiePart) => cookiePart.trim())
    .find((cookiePart) => cookiePart.startsWith(`${preferredPersonaCookieName}=`));

  return getPersona(personaCookie?.slice(preferredPersonaCookieName.length + 1));
}

export function readPreferredPersona() {
  if (typeof window === "undefined") {
    return defaultPersona;
  }

  try {
    const storedPersona = window.localStorage.getItem(preferredPersonaStorageKey);

    if (storedPersona) {
      return getPersona(storedPersona);
    }
  } catch {
    // Fall through to the cookie fallback when storage is unavailable.
  }

  try {
    return getPreferredPersonaFromCookieString(window.document.cookie);
  } catch {
    return defaultPersona;
  }
}

export function persistPreferredPersona(persona: Persona) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(preferredPersonaStorageKey, persona);
  } catch {
    // Keep going so the cookie still reflects the preferred persona.
  }

  try {
    window.document.cookie =
      `${preferredPersonaCookieName}=${persona}; ` +
      `Path=/; Max-Age=${preferredPersonaCookieMaxAgeSeconds}; SameSite=Lax`;
  } catch {
    return;
  }
}
