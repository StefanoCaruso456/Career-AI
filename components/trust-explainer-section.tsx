import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { TrustExplainerContent } from "@/components/chat-home-shell-content";
import { ScrollReveal } from "@/components/scroll-reveal";
import styles from "./trust-explainer-section.module.css";

export function TrustExplainerSection({ content }: { content: TrustExplainerContent }) {
  return (
    <section className={styles.section} id="trust">
      <div className={styles.shell}>
        <div className={styles.panel}>
          <div className={styles.topGrid}>
            <ScrollReveal className={styles.motionBlock} y={34}>
              <div className={styles.copyColumn}>
                <span className={styles.eyebrow}>A2A protocol for hiring</span>
                <h2 className={styles.headline}>{content.headline}</h2>
                <p className={styles.subheadline}>{content.subheadline}</p>
                <p className={styles.body}>{content.body}</p>
              </div>
            </ScrollReveal>

            <ScrollReveal className={styles.motionBlock} delay={0.08} x={28} y={24}>
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
                  <p className={styles.logoCaption}>Recruiter Agent &lt;-&gt; Job Seeker Agent</p>
                </div>
              </div>
            </ScrollReveal>
          </div>

          <div className={styles.cardsGrid}>
            {content.cards.map((card, index) => {
              const Icon = card.icon;

              return (
                <ScrollReveal
                  className={styles.motionBlock}
                  delay={0.05 * index}
                  key={card.title}
                  rotate={index % 2 === 0 ? -1.4 : 1.4}
                  y={26}
                >
                  <article className={styles.card}>
                    <span className={styles.cardIcon} aria-hidden="true">
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    <h3 className={styles.cardTitle}>{card.title}</h3>
                    <p className={styles.cardCopy}>{card.copy}</p>
                  </article>
                </ScrollReveal>
              );
            })}
          </div>

          <ScrollReveal className={styles.motionBlock} delay={0.1} y={28}>
            <div className={styles.footerRow}>
              <p className={styles.trustLine}>{content.trustLine}</p>

              {content.cta ? (
                <Link className={styles.cta} href={content.cta.href}>
                  {content.cta.label}
                  <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                </Link>
              ) : null}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
