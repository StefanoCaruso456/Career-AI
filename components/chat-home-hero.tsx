"use client";

import { useState } from "react";
import type { HeroComposerContent } from "./chat-home-shell-content";
import { HeroComposer } from "./hero-composer";
import styles from "./chat-home-shell.module.css";
import type { Persona } from "@/lib/personas";

export function ChatHomeHero({
  embeddedInWorkspaceShell = false,
  heroComposer,
  heroTitle,
  persona = "job_seeker",
}: {
  embeddedInWorkspaceShell?: boolean;
  heroComposer: HeroComposerContent;
  heroTitle: string;
  persona?: Persona;
}) {
  const [hasActiveConversation, setHasActiveConversation] = useState(false);
  const [heroTitleLead, ...heroTitleSublineParts] = heroTitle
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const heroTitleSubline = heroTitleSublineParts.join(" ");

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
          <span className={[styles.heroTitleLine, styles.heroTitleLead].join(" ")}>
            {heroTitleLead}
          </span>
          {heroTitleSubline ? (
            <span className={[styles.heroTitleLine, styles.heroTitleSubline].join(" ")}>
              {heroTitleSubline}
            </span>
          ) : null}
        </h1>

        <HeroComposer
          content={heroComposer}
          onConversationStateChange={setHasActiveConversation}
        />
      </div>
    </section>
  );
}
