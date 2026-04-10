"use client";

import { useEffect } from "react";
import { persistPreferredPersona } from "@/lib/persona-preference";
import type { Persona } from "@/lib/personas";

export function PersonaPreferenceSync({ persona }: { persona: Persona }) {
  useEffect(() => {
    // TODO: Replace this client-side preference sync with persisted profile persona
    // once the backend stores persona as part of the user identity record.
    persistPreferredPersona(persona);
  }, [persona]);

  return null;
}
