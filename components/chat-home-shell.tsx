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

function CareerAiAgentExchangeMark() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="translate(2 2)"
    >
      <g strokeWidth="2.4">
        <rect x="1" y="8" width="18" height="13" rx="5.5" />
        <path d="M10 8V4.8" />
        <path d="M6.4 21V24.4" />
        <path d="M13.6 21V24.4" />
      </g>
      <circle cx="7" cy="14.6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="13" cy="14.6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="10" cy="3.2" r="1.4" fill="currentColor" stroke="none" />

      <g strokeWidth="2.4" transform="translate(34 0)">
        <rect x="1" y="8" width="18" height="13" rx="5.5" />
        <path d="M10 8V4.8" />
        <path d="M6.4 21V24.4" />
        <path d="M13.6 21V24.4" />
      </g>
      <circle cx="41" cy="14.6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="47" cy="14.6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="44" cy="3.2" r="1.4" fill="currentColor" stroke="none" />

      <path d="M22.8 12.5h8.4" strokeWidth="2.15" />
      <path d="M27.2 9.3 31.6 12.5 27.2 15.7" strokeWidth="2.15" />
      <path d="M31.2 17.1h-8.4" strokeWidth="2.15" />
      <path d="M26.8 13.9 22.4 17.1 26.8 20.3" strokeWidth="2.15" />
    </g>
  );
}

function GlobalVerificationArt() {
  return (
    <svg
      aria-hidden="true"
      className={styles.globalVisualArt}
      viewBox="0 0 480 240"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="globalSurface" x1="56" x2="424" y1="18" y2="222" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#162137" />
          <stop offset="0.58" stopColor="#0e1523" />
          <stop offset="1" stopColor="#0a1019" />
        </linearGradient>
        <radialGradient id="globalGlow" cx="0" cy="0" r="1" gradientTransform="translate(240 132) rotate(90) scale(94 170)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#79a8ff" stopOpacity="0.34" />
          <stop offset="0.42" stopColor="#4d7aff" stopOpacity="0.18" />
          <stop offset="1" stopColor="#0d1320" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nodeGlow" cx="0" cy="0" r="1" gradientTransform="translate(72 42) rotate(90) scale(58 78)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#97b8ff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#97b8ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nodeFill" x1="22" x2="122" y1="8" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8f9ad5" stopOpacity="0.92" />
          <stop offset="1" stopColor="#536ab3" stopOpacity="0.58" />
        </linearGradient>
        <linearGradient id="nodeStroke" x1="12" x2="132" y1="14" y2="74" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8bb0ff" />
          <stop offset="1" stopColor="#9bc4ff" stopOpacity="0.48" />
        </linearGradient>
        <linearGradient id="bridgeStroke" x1="114" x2="366" y1="126" y2="126" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#76bcff" stopOpacity="0.92" />
          <stop offset="0.5" stopColor="#c3e5ff" />
          <stop offset="1" stopColor="#76bcff" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id="bubbleFill" x1="224" x2="258" y1="92" y2="134" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f4fbff" />
          <stop offset="1" stopColor="#cae3ff" />
        </linearGradient>
      </defs>

      <rect x="0.5" y="0.5" width="479" height="239" rx="26" fill="url(#globalSurface)" />
      <rect x="0.5" y="0.5" width="479" height="239" rx="26" stroke="#ffffff" strokeOpacity="0.08" />
      <rect x="1" y="1" width="478" height="238" rx="25.5" fill="url(#globalGlow)" />

      <g opacity="0.22">
        {[
          [118, 40],
          [154, 54],
          [201, 38],
          [243, 48],
          [290, 40],
          [332, 58],
          [96, 182],
          [146, 198],
          [201, 184],
          [278, 196],
          [330, 184],
          [380, 198],
        ].map(([cx, cy], index) => (
          <circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} fill="#d2e6ff" r="2.6" />
        ))}
      </g>

      <path
        d="M146 132C179 110 209 101 240 101C271 101 301 110 334 132"
        fill="none"
        opacity="0.94"
        stroke="url(#bridgeStroke)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M154 144C186 164 213 173 240 173C267 173 294 164 326 144"
        fill="none"
        opacity="0.32"
        stroke="url(#bridgeStroke)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      <g transform="translate(76 86)">
        <ellipse cx="70" cy="50" rx="82" ry="58" fill="url(#nodeGlow)" />
        <rect x="0" y="10" width="140" height="78" rx="39" fill="url(#nodeFill)" />
        <rect x="0.75" y="10.75" width="138.5" height="76.5" rx="38.25" stroke="url(#nodeStroke)" strokeWidth="1.5" />
        <rect x="6" y="16" width="128" height="66" rx="33" fill="#ffffff" fillOpacity="0.06" />
        <g color="#232535" transform="translate(34 34)">
          <CareerAiAgentExchangeMark />
        </g>
      </g>

      <g transform="translate(264 86)">
        <ellipse cx="70" cy="50" rx="82" ry="58" fill="url(#nodeGlow)" />
        <rect x="0" y="10" width="140" height="78" rx="39" fill="url(#nodeFill)" />
        <rect x="0.75" y="10.75" width="138.5" height="76.5" rx="38.25" stroke="url(#nodeStroke)" strokeWidth="1.5" />
        <rect x="6" y="16" width="128" height="66" rx="33" fill="#ffffff" fillOpacity="0.06" />
        <g color="#232535" transform="translate(34 34)">
          <CareerAiAgentExchangeMark />
        </g>
      </g>

      <g transform="translate(218 96)">
        <path
          d="M18 0C27.941 0 36 8.059 36 18C36 27.941 27.941 36 18 36H9.6L1 44L4.8 34.2C1.77 30.869 0 26.443 0 21.6V18C0 8.059 8.059 0 18 0Z"
          fill="url(#bubbleFill)"
          stroke="#5db3ff"
          strokeWidth="2.5"
        />
      </g>
    </svg>
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
        <GlobalVerificationArt />
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
              <span
                className={styles.proofWordmark}
                key={typeof surface === "string" ? surface : surface.label}
              >
                <span>{typeof surface === "string" ? surface : surface.label}</span>
                {typeof surface === "string" || !surface.note ? null : (
                  <span className={styles.proofWordmarkNote}>{surface.note}</span>
                )}
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
