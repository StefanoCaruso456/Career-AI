import { defaultPersona, getPersona, type Persona } from "./personas";

const preferredPersonaStorageKey = "career-ai.preferred-persona";

export function readPreferredPersona() {
  if (typeof window === "undefined") {
    return defaultPersona;
  }

  try {
    return getPersona(window.localStorage.getItem(preferredPersonaStorageKey));
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
    return;
  }
}
