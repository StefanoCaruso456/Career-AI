import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { LandingContent, SolutionVariant, StoryTheme } from "./chat-home-shell-content";
import { ChatHomeHero } from "./chat-home-hero";
import { HomepageChapterRail } from "./homepage-chapter-rail";
import { ScrollReveal } from "./scroll-reveal";
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

function CareerAiAgentMark() {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      transform="translate(2 2)"
    >
      <g strokeWidth="2.35">
        <rect x="2" y="9" width="20" height="14" rx="6" />
        <path d="M12 9V5.2" />
        <path d="M7.8 23V27" />
        <path d="M16.2 23V27" />
        <path d="M5.2 23 2.2 28.2" />
        <path d="M18.8 23 21.8 28.2" />
        <path d="M7 30.2h10" />
      </g>
      <circle cx="8.4" cy="16" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="16" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="12" cy="3.2" r="1.55" fill="currentColor" stroke="none" />
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
        <radialGradient id="pillGlow" cx="0" cy="0" r="1" gradientTransform="translate(86 52) rotate(90) scale(72 112)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9ec1ff" stopOpacity="0.24" />
          <stop offset="1" stopColor="#9ec1ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pillFill" x1="26" x2="146" y1="6" y2="106" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbfdff" stopOpacity="0.98" />
          <stop offset="0.58" stopColor="#edf2f8" stopOpacity="0.96" />
          <stop offset="1" stopColor="#dbe4f0" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="pillStroke" x1="12" x2="164" y1="14" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="1" stopColor="#a8bdd9" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="bridgeStroke" x1="114" x2="366" y1="126" y2="126" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#76bcff" stopOpacity="0.92" />
          <stop offset="0.5" stopColor="#c3e5ff" />
          <stop offset="1" stopColor="#76bcff" stopOpacity="0.92" />
        </linearGradient>
        <radialGradient id="bubbleGlow" cx="0" cy="0" r="1" gradientTransform="translate(24 20) rotate(90) scale(28 38)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#9dc7ff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#9dc7ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bubbleFill" x1="216" x2="264" y1="94" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fbfdff" />
          <stop offset="1" stopColor="#e2eaf5" />
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

      <g transform="translate(40 74)">
        <ellipse cx="86" cy="60" rx="98" ry="70" fill="url(#pillGlow)" />
        <rect x="0" y="10" width="172" height="100" rx="50" fill="url(#pillFill)" />
        <rect x="0.8" y="10.8" width="170.4" height="98.4" rx="49.2" stroke="url(#pillStroke)" strokeWidth="1.6" />
        <rect x="8" y="18" width="156" height="84" rx="42" fill="#ffffff" fillOpacity="0.18" />
        <g color="#233249" transform="translate(73 34)">
          <CareerAiAgentMark />
        </g>
        <text
          x="86"
          y="88"
          fill="#233249"
          fontSize="16"
          fontWeight="700"
          letterSpacing="0.04em"
          textAnchor="middle"
        >
          Agent
        </text>
      </g>

      <g transform="translate(268 74)">
        <ellipse cx="86" cy="60" rx="98" ry="70" fill="url(#pillGlow)" />
        <rect x="0" y="10" width="172" height="100" rx="50" fill="url(#pillFill)" />
        <rect x="0.8" y="10.8" width="170.4" height="98.4" rx="49.2" stroke="url(#pillStroke)" strokeWidth="1.6" />
        <rect x="8" y="18" width="156" height="84" rx="42" fill="#ffffff" fillOpacity="0.18" />
        <g color="#233249" transform="translate(73 34)">
          <CareerAiAgentMark />
        </g>
        <text
          x="86"
          y="88"
          fill="#233249"
          fontSize="16"
          fontWeight="700"
          letterSpacing="0.04em"
          textAnchor="middle"
        >
          Agent
        </text>
      </g>

      <g transform="translate(216 97)">
        <ellipse cx="24" cy="20" rx="34" ry="24" fill="url(#bubbleGlow)" />
        <path
          d="M20 0C31.046 0 40 8.954 40 20C40 31.046 31.046 40 20 40H12L2.4 48L6.4 37C2.379 33.132 0 27.691 0 22V20C0 8.954 8.954 0 20 0Z"
          fill="url(#bubbleFill)"
          stroke="#91b3da"
          strokeWidth="2.25"
        />
        <text
          x="20"
          y="24"
          fill="#233249"
          fontSize="16"
          fontWeight="700"
          letterSpacing="0.06em"
          textAnchor="middle"
        >
          to
        </text>
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
  const chapters = [
    {
      id: "platform",
      label: "Platform",
      summary: content.introRailLead,
    },
    {
      id: "stories",
      label: "Stories",
      summary: content.storyCopy,
    },
    {
      id: "solutions",
      label: "Solutions",
      summary: content.solutionSubheading,
    },
    {
      id: "metrics",
      label: "Metrics",
      summary: content.metricsTitle,
    },
    {
      id: "trust",
      label: "Trust",
      summary: content.trustExplainer.trustLine,
    },
  ];

  return (
    <div className={styles.page}>
      <ChatHomeHero
        embeddedInWorkspaceShell={embeddedInWorkspaceShell}
        heroComposer={content.heroComposer}
        heroTitle={content.heroTitle}
        persona={persona}
      />

      <div className={styles.narrativeShell}>
        <HomepageChapterRail chapters={chapters} />

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
              <ScrollReveal className={styles.motionBlock} once y={36}>
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
              </ScrollReveal>

              <ScrollReveal className={styles.motionBlock} delay={0.08} once x={24} y={18}>
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
              </ScrollReveal>
            </div>

            <div className={styles.proofBand}>
              {content.proofSurfaces.map((surface, index) => (
                <ScrollReveal
                  className={styles.proofWordmarkItem}
                  delay={0.05 * index}
                  key={typeof surface === "string" ? surface : surface.label}
                  once
                  y={18}
                >
                  <span className={styles.proofWordmark}>
                    <span>{typeof surface === "string" ? surface : surface.label}</span>
                    {typeof surface === "string" || !surface.note ? null : (
                      <span className={styles.proofWordmarkNote}>{surface.note}</span>
                    )}
                  </span>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.storySection} id="stories">
          <div className={styles.sectionShell}>
            <div className={styles.storyHeader}>
              <ScrollReveal className={styles.motionBlock} once y={28}>
                <div>
                  <span className={styles.sectionEyebrow}>{content.storyEyebrow}</span>
                  <h2 className={styles.storyTitle}>{content.storyTitle}</h2>
                </div>
              </ScrollReveal>

              <ScrollReveal className={styles.motionBlock} delay={0.08} once x={18} y={20}>
                <p className={styles.storyCopy}>{content.storyCopy}</p>
              </ScrollReveal>
            </div>

            <div className={styles.storyGrid}>
              {content.stories.map((story, index) => (
                <ScrollReveal
                  className={styles.motionBlock}
                  delay={0.05 * index}
                  key={`${story.company}-${story.theme}-${index}`}
                  once
                  y={26}
                >
                  <article className={styles.storyCard}>
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
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.solutionsSection} id="solutions">
          <div className={styles.sectionShell}>
            <ScrollReveal className={styles.motionBlock} once y={30}>
              <div className={styles.solutionHeader}>
                <h2 className={styles.solutionHeading}>
                  {content.solutionHeading}
                  <span>{content.solutionSubheading}</span>
                </h2>
              </div>
            </ScrollReveal>

            <div className={styles.solutionGrid}>
              {content.solutions.map((solution, index) => (
                <ScrollReveal
                  className={styles.motionBlock}
                  delay={0.04 * index}
                  key={solution.title}
                  once
                  y={30}
                >
                  <SolutionCard {...solution} />
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.metricsSection} id="metrics">
          <div className={styles.sectionShell}>
            <ScrollReveal className={styles.motionBlock} once y={28}>
              <div className={styles.metricsHeader}>
                <span className={styles.metricsEyebrow}>{content.metricsEyebrow}</span>
                <h2 className={styles.metricsTitle}>{content.metricsTitle}</h2>
              </div>
            </ScrollReveal>

            <div className={styles.metricGrid}>
              {content.metrics.map((metric, index) => (
                <article className={styles.metricCard} key={metric.label}>
                  <ScrollReveal
                    className={styles.motionBlock}
                    delay={0.05 * index}
                    once
                    y={24}
                  >
                    <p className={styles.metricValue}>{metric.value}</p>
                    <p className={styles.metricLabel}>{metric.label}</p>
                  </ScrollReveal>
                </article>
              ))}
            </div>

            <div className={styles.metricsBurst}>
              <div className={styles.metricsGlow} />
            </div>
          </div>
        </section>

        <ScrollReveal className={styles.motionBlock} once y={36}>
          <TrustExplainerSection content={content.trustExplainer} />
        </ScrollReveal>

        <footer className={styles.footer} id="footer">
          <div className={styles.sectionShell}>
            <div className={styles.footerHeader}>
              <ScrollReveal className={styles.motionBlock} once y={28}>
                <div>
                  <span className={styles.sectionEyebrow}>{content.footerEyebrow}</span>
                  <h2 className={styles.footerTitle}>{content.footerTitle}</h2>
                </div>
              </ScrollReveal>

              <ScrollReveal className={styles.motionBlock} delay={0.06} once x={18} y={18}>
                <Link className={styles.primaryCta} href="#platform">
                  {content.footerCtaLabel}
                  <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                </Link>
              </ScrollReveal>
            </div>

            <div className={styles.footerGrid}>
              {content.footerColumns.map((column, index) => (
                <ScrollReveal
                  className={styles.motionBlock}
                  delay={0.04 * index}
                  key={column.title}
                  once
                  y={24}
                >
                  <div className={styles.footerColumn}>
                    <h3>{column.title}</h3>
                    <ul>
                      {column.links.map((link) => (
                        <li key={link}>
                          <Link href="#platform">{link}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            <ScrollReveal className={styles.motionBlock} delay={0.08} once y={20}>
              <div className={styles.footerBottom}>
                <span>Career AI</span>
                <span>{content.footerTagline}</span>
              </div>
            </ScrollReveal>
          </div>
        </footer>
      </div>
    </div>
  );
}
