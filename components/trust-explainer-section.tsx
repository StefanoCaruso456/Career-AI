import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TrustExplainerContent } from "@/components/chat-home-shell-content";
import styles from "./trust-explainer-section.module.css";

export function TrustExplainerSection({ content }: { content: TrustExplainerContent }) {
  return (
    <section className={styles.section} id="trust">
      <div className={styles.shell}>
        <div className={styles.panel}>
          <div className={styles.topGrid}>
            <div className={styles.copyColumn}>
              <span className={styles.eyebrow}>A2A protocol for hiring</span>
              <h2 className={styles.headline}>{content.headline}</h2>
              <p className={styles.subheadline}>{content.subheadline}</p>
              <p className={styles.body}>{content.body}</p>
            </div>

            <div className={styles.visualColumn}>
              <div className={styles.logoPanel}>
                <Image
                  alt="Career AI logo"
                  className={styles.logoImage}
                  height={392}
                  sizes="(max-width: 760px) 11rem, 14rem"
                  src="/career-ai-header-logo.png"
                  width={684}
                />
                <p className={styles.logoCaption}>HR agent to job seeker agent</p>
              </div>

              <div className={styles.visualFrame}>
                <Image
                  alt="Illustration of secure agent-to-agent communication around verified Career ID trust."
                  className={styles.visualImage}
                  height={1024}
                  sizes="(max-width: 920px) 100vw, 46vw"
                  src="/career-id-a2a-trust.png"
                  width={1536}
                />
              </div>
            </div>
          </div>

          <div className={styles.cardsGrid}>
            {content.cards.map((card) => {
              const Icon = card.icon;

              return (
                <article className={styles.card} key={card.title}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <h3 className={styles.cardTitle}>{card.title}</h3>
                  <p className={styles.cardCopy}>{card.copy}</p>
                </article>
              );
            })}
          </div>

          <div className={styles.footerRow}>
            <p className={styles.trustLine}>{content.trustLine}</p>

            {content.cta ? (
              <Link className={styles.cta} href={content.cta.href}>
                {content.cta.label}
                <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
