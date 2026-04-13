"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { persistPreferredPersona } from "@/lib/persona-preference";
import type { Persona } from "@/lib/personas";

export function PersonaPreferenceSync({ persona }: { persona: Persona }) {
  const { data: session, status } = useSession();
  const lastPersistedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    persistPreferredPersona(persona);
  }, [persona]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.appUserId) {
      return;
    }

    const persistenceKey = `${session.user.appUserId}:${persona}`;

    if (lastPersistedKeyRef.current === persistenceKey) {
      return;
    }

    lastPersistedKeyRef.current = persistenceKey;
    const controller = new AbortController();

    void fetch("/api/preferences/persona", {
      body: JSON.stringify({ persona }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    }).catch(() => {
      lastPersistedKeyRef.current = null;
    });

    return () => {
      controller.abort();
    };
  }, [persona, session?.user?.appUserId, status]);

  return null;
}
