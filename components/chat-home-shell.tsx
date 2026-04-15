import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { LandingContent, SolutionVariant, StoryTheme } from "./chat-home-shell-content";
import { ChatHomeHero } from "./chat-home-hero";
import { TrustExplainerSection } from "./trust-explainer-section";
import styles from "./chat-home-shell.module.css";
import type { Persona } from "@/lib/personas";

function StoryVisual({ theme }: { theme: StoryTheme }) {
  return (
    <div
      className={[
        styles.storyVisual,
        theme === "aura" ? styles.storyAura : "",
        theme === "stream" ? styles.storyStream : "",
        theme === "grid" ? styles.storyMesh : "",
        theme === "orb" ? styles.storyOrb : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.storyMark} />
    </div>
  );
}

function IntroSectionTitle({
  lines,
}: {
  lines: Array<{ highlight?: boolean; text: string }>;
}) {
  return (
    <div className={styles.sectionTitleStack}>
      <h2 className={styles.sectionTitle}>
        {lines.map((line) => (
          <span
            className={[
              styles.sectionTitleLine,
              line.highlight ? styles.sectionTitleLineHighlight : "",
            ].join(" ")}
            key={line.text}
          >
            {line.text}
          </span>
        ))}
      </h2>
    </div>
  );
}

function SolutionVisual({ variant }: { variant: SolutionVariant }) {
  if (variant === "verificationStack") {
    return (
      <div className={styles.visualShell}>
        <div className={styles.mobileProof}>
          <div className={styles.mobileScreen}>
            <div className={styles.mobileTitle}>Verify claim</div>
            <div className={styles.mobileAmount}>92%</div>
            <div className={styles.mobileRows}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.mobileAction}>Continue review</div>
          </div>
        </div>

        <div className={styles.reviewWorkspace}>
          <div className={styles.browserBar}>
            <span />
            <span />
            <span />
            <div className={styles.browserAddress}>taid.ai/review/employment</div>
          </div>
          <div className={styles.workspaceBody}>
            <div className={styles.workspacePanel}>
              <div className={styles.panelHeading}>Claim intake</div>
              <div className={styles.lineGroup}>
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className={styles.workspacePanel}>
              <div className={styles.panelHeading}>Verification summary</div>
              <div className={styles.summaryRows}>
                <div />
                <div />
                <div />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "shareLayer") {
    return (
      <div className={styles.shareVisual}>
        <div className={styles.shareCard}>
          <div className={styles.shareHeader}>
            <span className={styles.shareDot} />
            <div>
              <strong>Trust Summary</strong>
              <small>Recruiter-safe projection</small>
            </div>
          </div>
          <div className={styles.shareBars}>
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className={styles.shareChart}>
          <div className={styles.chartGrid}>
            {Array.from({ length: 12 }).map((_, index) => (
              <span key={index} style={{ height: `${28 + ((index % 6) + 1) * 10}px` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "endorsementFlow") {
    return (
      <div className={styles.endorsementVisual}>
        <div className={styles.chatBubble}>Can you verify how we worked together?</div>
        <div className={styles.chatBubbleAlt}>
          Absolutely. I can confirm ownership, scope, and overlap.
        </div>
        <div className={styles.productTiles}>
          <div>
            <span />
            <strong>Relationship</strong>
            <small>4 years</small>
          </div>
          <div>
            <span />
            <strong>Overlap</strong>
            <small>Acme Inc</small>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "agentIdCard") {
    return (
      <div className={styles.identityVisual}>
        <div className={styles.agentCard}>
          <div className={styles.agentChip} />
          <div className={styles.agentMeta}>
            <span>Career AI</span>
            <strong>CAI-000123</strong>
          </div>
          <div className={styles.agentBrand}>SOUL RECORD</div>
        </div>
      </div>
    );
  }

  if (variant === "globalVerification") {
    return (
      <div className={styles.globalVisual}>
        <div className={styles.globalLabel}>US • UK • BR • SG</div>
        <div className={styles.globalArcMain} />
        <div className={styles.globalArcAlt} />
        <div className={styles.globalHalo} />
      </div>
    );
  }

  return (
    <div className={styles.embedVisual}>
      <div className={styles.embedToast}>
        <strong>Trust profile updated</strong>
        <span>Reviewer action synced to recruiter projection.</span>
      </div>
      <div className={styles.embedTable}>
        <div className={styles.embedHeader}>
          <span>Candidate</span>
          <span>Status</span>
          <span>Source</span>
        </div>
        {["Daybreak Yoga", "Northstar Labs", "Atlas Health"].map((row) => (
          <div className={styles.embedRow} key={row}>
            <span>{row}</span>
            <span>Reviewed</span>
            <span>Document + reviewer</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SolutionCard({
  cta,
  copy,
  eyebrow,
  icon: Icon,
  size,
  title,
  variant,
}: LandingContent["solutions"][number]) {
  return (
    <article
      className={[
        styles.solutionCard,
        size === "wide" ? styles.solutionWide : "",
        size === "tall" ? styles.solutionTall : "",
        size === "small" ? styles.solutionSmall : "",
        size === "wideBottom" ? styles.solutionWideBottom : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.solutionCopy}>
        <span className={styles.solutionEyebrow}>{eyebrow}</span>
        <div className={styles.solutionIcon}>
          <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
        </div>
        <h3 className={styles.solutionTitle}>{title}</h3>
        <p className={styles.solutionBody}>{copy}</p>
      </div>

      <SolutionVisual variant={variant} />

      <Link className={styles.inlineLink} href="#footer">
        {cta}
        <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2} />
      </Link>
    </article>
  );
}

export function ChatHomeShell({
  content,
  embeddedInWorkspaceShell = false,
  persona = "job_seeker",
}: {
  content: LandingContent;
  embeddedInWorkspaceShell?: boolean;
  persona?: Persona;
}) {
  return (
    <div className={styles.page}>
      <ChatHomeHero
        embeddedInWorkspaceShell={embeddedInWorkspaceShell}
        heroComposer={content.heroComposer}
        heroTitle={content.heroTitle}
        persona={persona}
      />

      <section className={styles.introSection} id="platform">
        <div className={[styles.sectionShell, styles.introShell].join(" ")}>
          <div aria-hidden="true" className={styles.introMotionField}>
            <div className={styles.introOrbitalGlow} />
            <div className={styles.introRibbonPrimary} />
            <div className={styles.introRibbonSecondary} />
            <div className={styles.introRibbonMesh} />
            <div className={styles.introRibbonSpine} />
          </div>

          <div className={styles.introGrid}>
            <div className={styles.introLead}>
              <span className={styles.sectionEyebrow}>{content.sectionEyebrow}</span>
              <IntroSectionTitle lines={content.introTitleLines} />
              <div className={styles.ctaRow}>
                <Link className={styles.primaryCta} href="#solutions">
                  {content.introPrimaryCta}
                  <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                </Link>
                <Link className={styles.secondaryCta} href="#stories">
                  {content.introSecondaryCta}
                </Link>
              </div>
            </div>

            <div className={styles.introRail}>
              <span className={styles.introRailEyebrow}>{content.introRailEyebrow}</span>
              <p className={styles.introRailLead}>{content.introRailLead}</p>
              <ul className={styles.introRailList}>
                {content.introRailItems.map((item) => (
                  <li className={styles.introRailItem} key={item.label}>
                    <strong>{item.label}</strong>
                    <span>{item.copy}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles.proofBand}>
            {content.proofSurfaces.map((surface) => (
              <span className={styles.proofWordmark} key={surface}>
                {surface}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.storySection} id="stories">
        <div className={styles.sectionShell}>
          <div className={styles.storyHeader}>
            <div>
              <span className={styles.sectionEyebrow}>{content.storyEyebrow}</span>
              <h2 className={styles.storyTitle}>{content.storyTitle}</h2>
            </div>

            <p className={styles.storyCopy}>{content.storyCopy}</p>
          </div>

          <div className={styles.storyGrid}>
            {content.stories.map((story, index) => (
              <article className={styles.storyCard} key={`${story.company}-${story.theme}-${index}`}>
                <StoryVisual theme={story.theme} />
                <div className={styles.storyMeta}>
                  <strong>{story.company}</strong>
                  <h3>{story.title}</h3>
                  <p>{story.copy}</p>
                  {story.comingSoon ? (
                    <span className={styles.inlineSoon}>{story.cta}</span>
                  ) : (
                    <Link className={styles.inlineLink} href="#footer">
                      {story.cta}
                      <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.solutionsSection} id="solutions">
        <div className={styles.sectionShell}>
          <div className={styles.solutionHeader}>
            <h2 className={styles.solutionHeading}>
              {content.solutionHeading}
              <span>{content.solutionSubheading}</span>
            </h2>
          </div>

          <div className={styles.solutionGrid}>
            {content.solutions.map((solution) => (
              <SolutionCard key={solution.title} {...solution} />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.metricsSection} id="metrics">
        <div className={styles.sectionShell}>
          <div className={styles.metricsHeader}>
            <span className={styles.metricsEyebrow}>{content.metricsEyebrow}</span>
            <h2 className={styles.metricsTitle}>{content.metricsTitle}</h2>
          </div>

          <div className={styles.metricGrid}>
            {content.metrics.map((metric) => (
              <article className={styles.metricCard} key={metric.label}>
                <p className={styles.metricValue}>{metric.value}</p>
                <p className={styles.metricLabel}>{metric.label}</p>
              </article>
            ))}
          </div>

          <div className={styles.metricsBurst}>
            <div className={styles.metricsGlow} />
          </div>
        </div>
      </section>

      <TrustExplainerSection content={content.trustExplainer} />

      <footer className={styles.footer} id="footer">
        <div className={styles.sectionShell}>
          <div className={styles.footerHeader}>
            <div>
              <span className={styles.sectionEyebrow}>{content.footerEyebrow}</span>
              <h2 className={styles.footerTitle}>{content.footerTitle}</h2>
            </div>
            <Link className={styles.primaryCta} href="#platform">
              {content.footerCtaLabel}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>

          <div className={styles.footerGrid}>
            {content.footerColumns.map((column) => (
              <div className={styles.footerColumn} key={column.title}>
                <h3>{column.title}</h3>
                <ul>
                  {column.links.map((link) => (
                    <li key={link}>
                      <Link href="#platform">{link}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className={styles.footerBottom}>
            <span>Career AI</span>
            <span>{content.footerTagline}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
