"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import styles from "./product-scrollytell.module.css";

/**
 * Shared scrollytelling runtime.
 *
 * Both /preview/story and /preview/futureStory import this shell.
 * Each page supplies:
 *   - introTitle
 *   - an ordered list of beats (eyebrow, title, body)
 *   - a renderVisual(beatId) function returning the sticky visual
 *   - a CTA card config
 *
 * The shell owns layout, sticky column, in-view tracking, and the CTA
 * card. No layout / sticky / motion concerns leak into the caller.
 */

export interface ScrollytellBeat {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
}

export interface ScrollytellCta {
  eyebrow: string;
  title: string;
  body: string;
  actions: Array<{
    href: string;
    label: string;
    primary?: boolean;
  }>;
}

export function ScrollytellShell({
  introTitle,
  beats,
  renderVisual,
  cta,
}: {
  introTitle: string;
  beats: ScrollytellBeat[];
  renderVisual: (beatId: string) => ReactNode;
  cta: ScrollytellCta;
}) {
  const [activeBeat, setActiveBeat] = useState<string>(beats[0]?.id ?? "");

  return (
    <section className={styles.container}>
      <div className={styles.intro}>
        <h1 className={styles.introTitle}>{introTitle}</h1>
      </div>

      <div className={styles.grid}>
        <div className={styles.stickyWrap}>
          <div className={styles.stickyInner}>
            <div className={styles.stage}>{renderVisual(activeBeat)}</div>
            <div className={styles.ticker}>
              {beats.map((beat) => (
                <div
                  key={beat.id}
                  className={`${styles.tickerDot} ${beat.id === activeBeat ? styles.tickerDotActive : ""}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className={styles.narrative}>
          {beats.map((beat) => (
            <BeatSection key={beat.id} beat={beat} onActivate={setActiveBeat} />
          ))}
          <CtaSection cta={cta} />
        </div>
      </div>
    </section>
  );
}

function BeatSection({
  beat,
  onActivate,
}: {
  beat: ScrollytellBeat;
  onActivate: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.5 });

  useEffect(() => {
    if (inView) onActivate(beat.id);
  }, [inView, beat.id, onActivate]);

  return (
    <section ref={ref} className={styles.beat}>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0.25, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={styles.beatContent}
      >
        <span className={styles.eyebrow}>{beat.eyebrow}</span>
        <h2 className={styles.beatTitle}>{beat.title}</h2>
        <p className={styles.beatBody}>{beat.body}</p>
      </motion.div>
    </section>
  );
}

function CtaSection({ cta }: { cta: ScrollytellCta }) {
  return (
    <section className={styles.ctaSection}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ amount: 0.4, once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={styles.ctaCard}
      >
        <span className={styles.eyebrow}>{cta.eyebrow}</span>
        <h2 className={styles.ctaTitle}>{cta.title}</h2>
        <p className={styles.ctaBody}>{cta.body}</p>
        <div className={styles.ctaActions}>
          {cta.actions.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              className={action.primary ? styles.ctaPrimary : styles.ctaSecondary}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
