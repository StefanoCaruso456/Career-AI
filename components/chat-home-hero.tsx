"use client";

import { useState } from "react";
import type { HeroComposerContent } from "./chat-home-shell-content";
import { HeroComposer } from "./hero-composer";
import styles from "./chat-home-shell.module.css";

export function ChatHomeHero({
  embeddedInWorkspaceShell = false,
  heroComposer,
  heroTitle,
}: {
  embeddedInWorkspaceShell?: boolean;
  heroComposer: HeroComposerContent;
  heroTitle: string;
}) {
  const [hasActiveConversation, setHasActiveConversation] = useState(false);

  return (
    <section
      className={[
        styles.heroSection,
        embeddedInWorkspaceShell ? styles.heroSectionEmbedded : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          styles.heroInner,
          embeddedInWorkspaceShell ? styles.heroInnerEmbedded : "",
          !hasActiveConversation ? styles.heroInnerLanding : "",
          hasActiveConversation ? styles.heroInnerConversation : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <h1
          className={[
            styles.heroTitle,
            embeddedInWorkspaceShell ? styles.heroTitleEmbedded : "",
            hasActiveConversation ? styles.heroTitleConversation : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className={styles.heroTitleLine}>
            {heroTitle}
          </span>
        </h1>

        <HeroComposer content={heroComposer} onConversationStateChange={setHasActiveConversation} />
      </div>
    </section>
  );
}
