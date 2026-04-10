"use client";

import { useState } from "react";
import { HeroComposer } from "./hero-composer";
import styles from "./chat-home-shell.module.css";

export function ChatHomeHero() {
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
            Career AI is a trusted identity platform that helps job seekers stand out to employers
            and get hired faster.
          </span>
        </h1>

        <HeroComposer onConversationStateChange={setHasActiveConversation} />
      </div>
    </section>
  );
}
