"use client";

import { useState } from "react";
import { landingContentByPersona } from "./chat-home-shell-content";
import { HeroComposer } from "./hero-composer";
import styles from "./chat-home-shell.module.css";
import type { Persona } from "@/lib/personas";

export function ChatHomeHero({ persona = "job_seeker" }: { persona?: Persona }) {
  const content = landingContentByPersona[persona];
  const [hasActiveConversation, setHasActiveConversation] = useState(false);

  return (
    <section className={styles.heroSection}>
      <div
        className={[
          styles.heroInner,
          !hasActiveConversation ? styles.heroInnerLanding : "",
          hasActiveConversation ? styles.heroInnerConversation : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <h1
          className={[
            styles.heroTitle,
            hasActiveConversation ? styles.heroTitleConversation : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.heroTitleLine}>
            {content.heroTitle}
          </span>
        </h1>

        <HeroComposer content={content.heroComposer} onConversationStateChange={setHasActiveConversation} />
      </div>
    </section>
  );
}
