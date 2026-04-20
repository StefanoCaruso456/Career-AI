"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  FileCheck2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { ScrollStoryContent } from "./chat-home-shell-content";
import styles from "./scroll-story-section.module.css";

function setStepRef(
  refs: MutableRefObject<Array<HTMLElement | null>>,
  index: number,
  node: HTMLElement | null,
) {
  refs.current[index] = node;
}

export function ScrollStorySection({ content }: { content: ScrollStoryContent }) {
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const activeStoryStep = content.steps[activeStep] ?? content.steps[0];

  const updateActiveStep = useEffectEvent((nextIndex: number) => {
    setActiveStep((currentStep) => (currentStep === nextIndex ? currentStep : nextIndex));
  });

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!visibleEntry) {
          return;
        }

        const nextIndex = Number(visibleEntry.target.getAttribute("data-step-index"));

        if (Number.isNaN(nextIndex)) {
          return;
        }

        updateActiveStep(nextIndex);
      },
      {
        rootMargin: "-18% 0px -34% 0px",
        threshold: [0.25, 0.45, 0.65],
      },
    );

    const observedSteps = stepRefs.current.filter(
      (step): step is HTMLElement => step instanceof HTMLElement,
    );

    observedSteps.forEach((step) => observer.observe(step));

    return () => observer.disconnect();
  }, [content.steps.length]);

  function jumpToStep(index: number) {
    const targetStep = stepRefs.current[index];

    if (!targetStep) {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    updateActiveStep(index);
    targetStep.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }

  return (
    <section className={styles.section} id="story-loop">
      <div className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>{content.eyebrow}</span>
          <h2 className={styles.title}>{content.title}</h2>
          <p className={styles.intro}>{content.intro}</p>
        </header>

        <div className={styles.layout}>
          <div className={styles.visualColumn}>
            <div className={styles.stageShell}>
              <div className={styles.stageChrome}>
                <div className={styles.chromeChip}>
                  <FileCheck2 aria-hidden="true" size={14} strokeWidth={2} />
                  <span>Own the proof</span>
                </div>
                <div className={styles.chromeChip}>
                  <ShieldCheck aria-hidden="true" size={14} strokeWidth={2} />
                  <span>Share safely</span>
                </div>
                <div className={styles.chromeChip}>
                  <Bot aria-hidden="true" size={14} strokeWidth={2} />
                  <span>Move faster</span>
                </div>
              </div>

              <div aria-hidden="true" className={styles.stageScene} data-step={activeStep}>
                <div className={styles.sceneGlowPrimary} />
                <div className={styles.sceneGlowSecondary} />
                <div className={styles.sceneGrid} />

                <div className={styles.documentChipOne}>Offer letter.pdf</div>
                <div className={styles.documentChipTwo}>Diploma.jpg</div>
                <div className={styles.documentChipThree}>Reference.msg</div>

                <div className={styles.identityCard}>
                  <div className={styles.identityHeader}>
                    <span>Career ID</span>
                    <strong>Verified Profile</strong>
                  </div>

                  <div className={styles.identityRows}>
                    <div className={styles.identityRow}>
                      <span>Work history</span>
                      <strong>Attached</strong>
                    </div>
                    <div className={styles.identityRow}>
                      <span>Education</span>
                      <strong>Verified</strong>
                    </div>
                    <div className={styles.identityRow}>
                      <span>Credentials</span>
                      <strong>Permissioned</strong>
                    </div>
                  </div>

                  <div className={styles.identityFooter}>
                    <span className={styles.identityBadge}>
                      <BadgeCheck aria-hidden="true" size={14} strokeWidth={2} />
                      Trust signal active
                    </span>
                    <span className={styles.identityBadgeMuted}>3 evidence sources linked</span>
                  </div>
                </div>

                <div className={styles.signalRing}>
                  <span />
                  <span />
                  <span />
                </div>

                <div className={styles.sharePanel}>
                  <div className={styles.sharePanelHeader}>
                    <span className={styles.sharePanelDot} />
                    <div>
                      <strong>Recruiter-safe view</strong>
                      <small>Only what you shared</small>
                    </div>
                  </div>
                  <div className={styles.sharePanelBars}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.sharePanelFootnote}>Verification labels stay attached</div>
                </div>

                <div className={styles.agentRail}>
                  <div className={styles.agentRailHeader}>
                    <Sparkles aria-hidden="true" size={15} strokeWidth={2} />
                    <span>Agent actions</span>
                  </div>
                  <div className={styles.agentRailSteps}>
                    <span>Match jobs</span>
                    <span>Apply with proof</span>
                    <span>Follow up</span>
                  </div>
                </div>
              </div>

              <div className={styles.stageFooter}>
                <p aria-live="polite" className={styles.stageStatus}>
                  <span>Now showing</span>
                  <strong>
                    {activeStoryStep.label}. {activeStoryStep.title}
                  </strong>
                </p>

                <nav aria-label="Story chapters" className={styles.chapterNav}>
                  {content.steps.map((step, index) => (
                    <button
                      aria-controls={`story-step-${step.id}`}
                      aria-current={index === activeStep ? "step" : undefined}
                      className={[
                        styles.chapterButton,
                        index === activeStep ? styles.chapterButtonActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      key={step.id}
                      onClick={() => jumpToStep(index)}
                      type="button"
                    >
                      <span>{step.label}</span>
                    </button>
                  ))}
                </nav>

                <div className={styles.actionRow}>
                  <Link className={styles.primaryCta} href={content.cta.href}>
                    {content.cta.label}
                    <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                  </Link>
                  <Link className={styles.secondaryCta} href={content.secondaryCta.href}>
                    {content.secondaryCta.label}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.storyColumn}>
            {content.steps.map((step, index) => (
              <article
                className={[
                  styles.storyBeat,
                  index === activeStep ? styles.storyBeatActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-step-index={index}
                id={`story-step-${step.id}`}
                key={step.id}
                onMouseEnter={() => updateActiveStep(index)}
                ref={(node) => setStepRef(stepRefs, index, node)}
              >
                <div className={styles.storyBeatNumber}>{String(index + 1).padStart(2, "0")}</div>
                <div className={styles.storyBeatCopy}>
                  <span className={styles.storyBeatLabel}>{step.label}</span>
                  <h3 className={styles.storyBeatTitle}>{step.title}</h3>
                  <p className={styles.storyBeatBody}>{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
