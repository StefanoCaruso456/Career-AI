import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileCheck2,
  Globe2,
  QrCode,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { HeroComposer } from "./hero-composer";
import styles from "./chat-home-shell.module.css";

type StoryTheme = "aura" | "stream" | "grid" | "orb";
type SolutionVariant =
  | "verificationStack"
  | "shareLayer"
  | "endorsementFlow"
  | "agentIdCard"
  | "globalVerification"
  | "platformEmbed";
type SolutionSize = "wide" | "tall" | "small" | "wideBottom";

const proofSurfaces = [
  "Employment",
  "Education",
  "Certifications",
  "Endorsements",
  "Agent QR",
  "Audit trail",
];

const introTitleLines = ["Identity infrastructure", "to grow hiring trust."];

const storyCards: Array<{
  company: string;
  title: string;
  copy: string;
  cta: string;
  theme: StoryTheme;
}> = [
  {
    company: "Lovable",
    title: "Lovable turns AI-heavy application volume into proof-backed shortlists.",
    copy: "Candidate evidence becomes readable trust, not another noisy PDF pile.",
    cta: "Read Lovable's story",
    theme: "aura",
  },
  {
    company: "Runway",
    title: "Runway-style teams protect recruiter time with structured verification intake.",
    copy: "Claims, artifacts, and reviewer actions stay linked from first upload to final decision.",
    cta: "Read Runway's story",
    theme: "stream",
  },
  {
    company: "Supabase",
    title: "Supabase-grade operations keep trust workflows auditable without slowing hiring.",
    copy: "Every status change flows through one verification engine with preserved provenance.",
    cta: "Read Supabase's story",
    theme: "grid",
  },
  {
    company: "Linear",
    title: "Linear-level hiring loops share recruiter-safe profiles instead of raw evidence.",
    copy: "The result is cleaner review, better candidate trust, and faster alignment.",
    cta: "Read Linear's story",
    theme: "orb",
  },
];

const solutions: Array<{
  eyebrow: string;
  title: string;
  copy: string;
  cta: string;
  icon: LucideIcon;
  variant: SolutionVariant;
  size: SolutionSize;
}> = [
  {
    eyebrow: "Trust foundation",
    title: "Capture and verify candidate records across employment, education, and certifications",
    copy:
      "Start with a single Soul Record, preserve the original evidence, and drive every status change through one shared verification engine.",
    cta: "Explore the verification stack",
    icon: FileCheck2,
    variant: "verificationStack",
    size: "wide",
  },
  {
    eyebrow: "Share layer",
    title: "Give recruiters a clean, permissioned trust profile instead of document chaos",
    copy:
      "Agent QR and recruiter-safe read models expose only what the candidate chooses to share, with clear verification labels and zero internal notes.",
    cta: "See recruiter-safe sharing",
    icon: QrCode,
    variant: "shareLayer",
    size: "tall",
  },
  {
    eyebrow: "Endorsements",
    title: "Request endorsements through guided, identity-aware workflows",
    copy:
      "Separate social proof from official proof while still preserving relationship context, source identity, and trust level.",
    cta: "Design endorsement flows",
    icon: UserRoundCheck,
    variant: "endorsementFlow",
    size: "small",
  },
  {
    eyebrow: "Identity",
    title: "Issue portable Talent Agent IDs with a trust layer built in",
    copy:
      "One candidate, one persistent identity object, one reusable trust surface across applications.",
    cta: "View the Agent ID model",
    icon: ShieldCheck,
    variant: "agentIdCard",
    size: "small",
  },
  {
    eyebrow: "Global verification",
    title: "Coordinate cross-border verification with consent and provenance at the center",
    copy:
      "Support employer checks, institution checks, and future agent-to-agent workflows without overclaiming certainty.",
    cta: "Map verification orchestration",
    icon: Globe2,
    variant: "globalVerification",
    size: "small",
  },
  {
    eyebrow: "Platform embed",
    title: "Embed trust data into your hiring stack without coupling recruiters to write-side systems",
    copy:
      "Project recruiter-safe summaries, keep admin operations auditable, and expose stable APIs for downstream workflows.",
    cta: "Review platform contracts",
    icon: Workflow,
    variant: "platformEmbed",
    size: "wideBottom",
  },
];

const metrics = [
  {
    value: "12",
    label: "verification lifecycle states that make trust explicit instead of implied",
  },
  {
    value: "5",
    label: "confidence tiers from self-reported claims through multi-source confirmation",
  },
  {
    value: "1",
    label: "portable Agent ID and Soul Record per candidate identity",
  },
  {
    value: "100%",
    label: "audit-ready reviewer actions with provenance preserved on every sensitive mutation",
  },
];

const footerColumns = [
  {
    title: "Platform",
    links: [
      "Talent Agent ID",
      "Soul Record",
      "Verification engine",
      "Recruiter read model",
      "Agent QR",
    ],
  },
  {
    title: "Solutions",
    links: [
      "Candidates",
      "Recruiters",
      "Hiring managers",
      "Verification ops",
      "Employer and institution checks",
    ],
  },
  {
    title: "Resources",
    links: [
      "Product requirements",
      "Roadmap and agent plan",
      "Development spec",
      "API surfaces",
      "Trust principles",
    ],
  },
  {
    title: "Company",
    links: [
      "Contact sales",
      "Platform docs",
      "Privacy controls",
      "Auditability",
      "GitHub repository",
    ],
  },
];

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

function IntroSectionTitle() {
  return (
    <div className={styles.sectionTitleStack}>
      <h2 className={styles.sectionTitle}>
        {introTitleLines.map((line) => (
          <span className={styles.sectionTitleLine} key={line}>
            {line}
          </span>
        ))}
      </h2>

      <h2
        aria-hidden="true"
        className={[styles.sectionTitle, styles.sectionTitleOverlay].join(" ")}
      >
        {introTitleLines.map((line) => (
          <span className={styles.sectionTitleLine} key={line}>
            {line}
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
            <span>Talent Agent ID</span>
            <strong>TAID-000123</strong>
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
  eyebrow,
  title,
  copy,
  cta,
  icon: Icon,
  variant,
  size,
}: (typeof solutions)[number]) {
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

export function ChatHomeShell() {
  return (
    <div className={styles.page}>
      <section className={styles.heroSection}>
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}>
            <Sparkles aria-hidden="true" size={16} strokeWidth={1.9} />
            <span>AI-native identity and verification for hiring</span>
          </div>

          <h1 className={styles.heroTitle}>What can I help with?</h1>

          <HeroComposer />

          <p className={styles.heroSubcopy}>
            Start with a conversation. Move into verified identity, evidence-backed claims,
            recruiter-safe sharing, and audit-ready review operations.
          </p>
        </div>
      </section>

      <section className={styles.introSection} id="platform">
        <div className={[styles.sectionShell, styles.introShell].join(" ")}>
          <div aria-hidden="true" className={styles.introMotionField}>
            <div className={styles.introRibbonGlow} />
            <div className={styles.introRibbon} />
            <div className={styles.introRibbonThreads} />
            <div className={styles.introRibbonFlash} />
          </div>

          <div className={styles.introGrid}>
            <div className={styles.introLead}>
              <span className={styles.sectionEyebrow}>Trust infrastructure for hiring</span>
              <IntroSectionTitle />
              <div className={styles.ctaRow}>
                <Link className={styles.primaryCta} href="#solutions">
                  Explore the platform
                  <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                </Link>
                <Link className={styles.secondaryCta} href="#stories">
                  See recruiter experiences
                </Link>
              </div>
            </div>

            <div className={styles.introCopyBlock}>
              <p>
                Talent Agent ID helps candidates prove credibility faster and helps
                recruiters review what is actually verified, not just what is claimed.
                One platform links claims, evidence, provenance, privacy controls, and
                recruiter-safe read models.
              </p>
              <ul className={styles.introList}>
                <li>Persistent Agent IDs and Soul Records for every candidate</li>
                <li>Structured claim capture across employment, education, and certifications</li>
                <li>Shareable trust views with explicit verification labels</li>
              </ul>
            </div>
          </div>

          <div className={styles.proofBand}>
            {proofSurfaces.map((surface) => (
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
              <span className={styles.sectionEyebrow}>Customer stories</span>
              <h2 className={styles.storyTitle}>
                Build a hiring trust foundation that enables faster, cleaner decisions.
              </h2>
            </div>

            <p className={styles.storyCopy}>
              From recruiter ops teams to hiring managers and candidate experience
              leaders, the platform turns fragmented proof into a reusable trust layer.
            </p>
          </div>

          <div className={styles.storyGrid}>
            {storyCards.map((story) => (
              <article className={styles.storyCard} key={story.company}>
                <StoryVisual theme={story.theme} />
                <div className={styles.storyMeta}>
                  <strong>{story.company}</strong>
                  <h3>{story.title}</h3>
                  <p>{story.copy}</p>
                  <Link className={styles.inlineLink} href="#footer">
                    {story.cta}
                    <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
                  </Link>
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
              Flexible trust workflows for every hiring model.
              <span>
                Grow candidate confidence and recruiter clarity with modular identity,
                verification, and sharing surfaces.
              </span>
            </h2>
          </div>

          <div className={styles.solutionGrid}>
            {solutions.map((solution) => (
              <SolutionCard key={solution.title} {...solution} />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.metricsSection} id="metrics">
        <div className={styles.sectionShell}>
          <div className={styles.metricsHeader}>
            <span className={styles.metricsEyebrow}>Built to make trust explicit</span>
            <h2 className={styles.metricsTitle}>The trust layer for modern hiring.</h2>
          </div>

          <div className={styles.metricGrid}>
            {metrics.map((metric) => (
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

      <footer className={styles.footer} id="footer">
        <div className={styles.sectionShell}>
          <div className={styles.footerHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Start building</span>
              <h2 className={styles.footerTitle}>
                Make candidate identity portable, verified, and recruiter-readable.
              </h2>
            </div>
            <Link className={styles.primaryCta} href="#platform">
              See the platform
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>

          <div className={styles.footerGrid}>
            {footerColumns.map((column) => (
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
            <span>Talent Agent ID</span>
            <span>Portable identity. Explicit trust. Audit-ready hiring.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
