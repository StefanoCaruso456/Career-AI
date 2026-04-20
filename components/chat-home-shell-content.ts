import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  FileCheck2,
  QrCode,
  ShieldCheck,
  UserRoundCheck,
  Users2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Persona } from "@/lib/personas";

export type StoryTheme = "aura" | "stream" | "grid" | "orb";
export type SolutionVariant =
  | "verificationStack"
  | "shareLayer"
  | "endorsementFlow"
  | "agentIdCard"
  | "globalVerification"
  | "platformEmbed";
export type SolutionSize = "wide" | "tall" | "small" | "wideBottom";

export type HeroComposerAction =
  | {
      accent?: "primary";
      kind: "link";
      href: string;
      label: string;
    }
  | {
      accent?: "jobs";
      kind: "filters";
      label: string;
    }
  | {
      accent?: "jobs";
      kind: "prompt";
      label: string;
      starterActionId?: string;
      value?: string;
    }
  | {
      accent?: "jobs";
      kind: "latest_jobs";
      label: string;
    };

export type HeroComposerContent = {
  composerPlaceholder: string;
  expandedComposerPlaceholder?: string;
  initialProjects: Array<{
    id: string;
    label: string;
  }>;
  starterActions: HeroComposerAction[];
  typingLabel: string;
};

type LandingStoryCard = {
  comingSoon?: boolean;
  company: string;
  copy: string;
  cta?: string;
  theme: StoryTheme;
  title: string;
};

type LandingSolution = {
  copy: string;
  cta: string;
  eyebrow: string;
  icon: LucideIcon;
  size: SolutionSize;
  title: string;
  variant: SolutionVariant;
};

type LandingMetric = {
  label: string;
  value: string;
};

type LandingProofSurface =
  | string
  | {
      label: string;
      note?: string;
    };

type LandingFooterColumn = {
  links: string[];
  title: string;
};

type TrustExplainerCard = {
  copy: string;
  icon: LucideIcon;
  title: string;
};

export type TrustExplainerContent = {
  body: string;
  cards: TrustExplainerCard[];
  cta?: {
    href: string;
    label: string;
  };
  headline: string;
  subheadline: string;
  trustLine: string;
};

export type ScrollStoryContent = {
  cta: {
    href: string;
    label: string;
  };
  eyebrow: string;
  intro: string;
  secondaryCta: {
    href: string;
    label: string;
  };
  steps: Array<{
    body: string;
    id: string;
    label: string;
    title: string;
  }>;
  title: string;
};

export type LandingContent = {
  footerColumns: LandingFooterColumn[];
  footerCtaLabel: string;
  footerEyebrow: string;
  footerTagline: string;
  footerTitle: string;
  heroComposer: HeroComposerContent;
  heroTitle: string;
  introPrimaryCta: string;
  introRailEyebrow: string;
  introRailItems: Array<{
    copy: string;
    label: string;
  }>;
  introRailLead: string;
  introSecondaryCta: string;
  introTitleLines: Array<{
    highlight?: boolean;
    text: string;
  }>;
  metrics: LandingMetric[];
  metricsEyebrow: string;
  metricsTitle: string;
  proofSurfaces: LandingProofSurface[];
  sectionEyebrow: string;
  solutionHeading: string;
  solutionSubheading: string;
  solutions: LandingSolution[];
  scrollStory?: ScrollStoryContent;
  stories: LandingStoryCard[];
  storyCopy: string;
  storyEyebrow: string;
  storyTitle: string;
  trustExplainer: TrustExplainerContent;
};

const sharedTrustExplainerCards: TrustExplainerCard[] = [
  {
    title: "Build verified credibility",
    copy:
      "Candidates add identity, work history, education, credentials, and supporting proof to their Career ID over time.",
    icon: FileCheck2,
  },
  {
    title: "Share securely",
    copy:
      "Information is permission-based and exchanged through secure agent-to-agent communication, so the right data can be requested safely.",
    icon: ShieldCheck,
  },
  {
    title: "Verify faster",
    copy:
      "Hiring agents can review trusted, verified information without waiting on slow manual follow-up and fragmented documents.",
    icon: Workflow,
  },
];

const sharedTrustExplainerContent = {
  headline: "How secure Career ID works",
  subheadline:
    "Job seekers build verified credibility over time. Hiring agents can request trusted information securely through agent-to-agent communication.",
  body:
    "Career ID helps candidates turn identity, work history, education, and supporting proof into a portable, verified profile. Instead of repeating the same information across every application, job seekers build credibility once and strengthen it over time. When employers or hiring agents need confirmation, they can request verified information securely through agent-to-agent communication. This creates a faster, safer way to verify candidate information, reduce manual back-and-forth, and build trust on both sides of the hiring process.",
  cards: sharedTrustExplainerCards,
  trustLine:
    "Portable. Verified. Secure. Built for faster trust between job seekers and hiring teams.",
} satisfies Omit<TrustExplainerContent, "cta">;

export const landingContentByPersona: Record<Persona, LandingContent> = {
  employer: {
    footerColumns: [
      {
        title: "Platform",
        links: [
          "Employer workspace",
          "Hiring trust summary",
          "Candidate verification",
          "Recruiter-safe read model",
          "Audit trail",
        ],
      },
      {
        title: "Solutions",
        links: [
          "Talent acquisition",
          "Hiring managers",
          "Recruiting operations",
          "Candidate screening",
          "Reference-backed review",
        ],
      },
      {
        title: "Resources",
        links: [
          "Implementation roadmap",
          "Employer onboarding",
          "Verification policy",
          "Review workflows",
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
    ],
    footerCtaLabel: "See employer workflows",
    footerEyebrow: "Start hiring with signal",
    footerTagline: "Clearer proof. Faster reviews. Better hiring confidence.",
    footerTitle: "Give every hiring team one recruiter-safe trust surface to review.",
    heroComposer: {
      composerPlaceholder:
        "Find jobs, build your Career ID, search talent, or source candidates.",
      expandedComposerPlaceholder:
        "Paste a job description or describe the candidate you want to find.",
      initialProjects: [
        { id: "project-candidate-pipeline", label: "Candidate pipeline" },
        { id: "project-role-scorecards", label: "Role scorecards" },
        { id: "project-reference-checks", label: "Reference checks" },
      ],
      starterActions: [
        {
          accent: "jobs",
          kind: "filters",
          label: "Find aligned candidates",
        },
        { kind: "prompt", label: "How do we verify candidate credibility faster?" },
        { kind: "prompt", label: "How can this reduce screening friction?" },
        { kind: "prompt", label: "How do we find aligned talent with more confidence?" },
        { accent: "primary", kind: "link", href: "#solutions", label: "See employer workflows" },
      ],
      typingLabel: "Thinking through your hiring workflow...",
    },
    heroTitle:
      "Career AI helps employers verify candidate credibility faster and hire with more confidence.",
    introPrimaryCta: "Explore employer workflows",
    introRailEyebrow: "How employer mode works",
    introRailItems: [
      {
        label: "Candidate trust summaries",
        copy: "Turn scattered resumes, references, and claims into one recruiter-safe signal layer.",
      },
      {
        label: "Review-ready proof",
        copy: "Keep provenance attached so hiring teams can see what is verified, not just asserted.",
      },
      {
        label: "Aligned hiring decisions",
        copy: "Give recruiters, managers, and founders one shared surface for credibility review.",
      },
    ],
    introRailLead:
      "Employer mode organizes candidate proof into a clean review surface so teams can move faster without lowering the bar.",
    introSecondaryCta: "See review scenarios",
    introTitleLines: [
      { text: "Signals" },
      { text: "that" },
      { text: "help teams" },
      { highlight: true, text: "hire" },
      { highlight: true, text: "with" },
      { highlight: true, text: "confidence." },
    ],
    metrics: [
      {
        value: "1",
        label: "shared hiring trust surface for recruiters, hiring managers, and screening ops",
      },
      {
        value: "6",
        label: "candidate proof categories that can be reviewed without digging through document chaos",
      },
      {
        value: "100%",
        label: "provenance-aware reviewer context attached to every surfaced hiring signal",
      },
      {
        value: "0",
        label: "extra back-and-forth needed when candidate evidence is already organized for the team",
      },
    ],
    metricsEyebrow: "Built for cleaner hiring review",
    metricsTitle: "A hiring trust layer your team can actually use.",
    proofSurfaces: [
      "Candidate proof",
      "References",
      "Role fit",
      "Scorecards",
      "Credibility",
      "Audit trail",
    ],
    sectionEyebrow: "Trust infrastructure for employer teams",
    solutionHeading: "Employer workflows that turn candidate proof into confident decisions.",
    solutionSubheading:
      "Review faster, align sooner, and keep every hiring signal grounded in permissioned evidence.",
    solutions: [
      {
        eyebrow: "Candidate review",
        title: "Open every application with a recruiter-safe trust summary instead of a document pile",
        copy:
          "Give hiring teams one structured candidate view with verification labels, source context, and only the proof that is meant to be shared.",
        cta: "See candidate review",
        icon: BriefcaseBusiness,
        variant: "verificationStack",
        size: "wide",
      },
      {
        eyebrow: "Screening clarity",
        title: "Surface aligned talent with proof-backed signals before interviews start",
        copy:
          "Compare candidates through signal strength, role relevance, and credibility context without over-reading weak evidence.",
        cta: "See shortlist logic",
        icon: BadgeCheck,
        variant: "shareLayer",
        size: "tall",
      },
      {
        eyebrow: "Reference context",
        title: "Collect references and endorsements in a format recruiters can actually trust",
        copy:
          "Preserve who said what, how they know the candidate, and where the trust level should sit in your review flow.",
        cta: "Review reference flows",
        icon: UserRoundCheck,
        variant: "endorsementFlow",
        size: "small",
      },
      {
        eyebrow: "Company workspace",
        title: "Create a durable employer review surface for every open role",
        copy:
          "Keep teams aligned around one hiring workspace that can evolve into scorecards, interview loops, and recruiter tooling later.",
        cta: "View workspace scaffold",
        icon: Building2,
        variant: "agentIdCard",
        size: "small",
      },
      {
        eyebrow: "Cross-functional review",
        title: "Coordinate recruiter, manager, and founder review without losing signal quality",
        copy:
          "Expose the same candidate proof base to every reviewer while keeping provenance and permission boundaries intact.",
        cta: "Map review orchestration",
        icon: Users2,
        variant: "globalVerification",
        size: "small",
      },
      {
        eyebrow: "Hiring systems",
        title: "Bring candidate trust data into your hiring stack without rebuilding your workflow",
        copy:
          "Add recruiter-safe summaries, review signals, and credibility context to downstream systems through stable read models.",
        cta: "See integration paths",
        icon: Workflow,
        variant: "platformEmbed",
        size: "wideBottom",
      },
    ],
    stories: [
      {
        company: "Northstar",
        title: "Northstar cuts noisy top-of-funnel review with candidate trust summaries.",
        copy: "Recruiters see what is verified first, then decide where deeper review is worth the time.",
        cta: "Read Northstar's story",
        theme: "aura",
      },
      {
        company: "Atlassian",
        title: "Hiring teams align faster when references, artifacts, and role fit live in one surface.",
        copy: "Instead of forwarding screenshots and PDFs, the team shares one permissioned candidate read model.",
        cta: "Read Atlassian's story",
        theme: "stream",
      },
      {
        company: "Ramp",
        title: "Ramp-style recruiting ops preserve auditability while moving candidates through review quickly.",
        copy: "The workflow keeps provenance visible even when multiple reviewers touch the same candidate.",
        cta: "Read Ramp's story",
        theme: "grid",
      },
      {
        company: "Linear",
        title: "Lean teams hire with more confidence when credibility is legible before interviews start.",
        copy: "The result is less screening drag and cleaner decisions on aligned talent.",
        cta: "Read Linear's story",
        theme: "orb",
      },
    ],
    storyCopy:
      "From lean startup teams to structured recruiting organizations, employer mode keeps candidate proof readable, permissioned, and decision-ready.",
    storyEyebrow: "Employer stories",
    storyTitle: "Build a hiring review layer that turns candidate signals into action.",
    trustExplainer: {
      ...sharedTrustExplainerContent,
      cta: {
        href: "#solutions",
        label: "See How Verification Works",
      },
    },
  },
  job_seeker: {
    footerColumns: [
      {
        title: "Platform",
        links: [
          "Career AI",
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
    ],
    footerCtaLabel: "See the platform",
    footerEyebrow: "Start building",
    footerTagline: "Portable identity. Explicit trust. Audit-ready hiring.",
    footerTitle: "Make candidate identity portable, verified, and recruiter-readable.",
    heroComposer: {
      composerPlaceholder:
        "Find jobs, build your Career ID, search talent, or source candidates.",
      initialProjects: [
        { id: "project-verified-profile", label: "Verified profile" },
        { id: "project-career-story", label: "Career story" },
        { id: "project-hiring-signals", label: "Hiring signals" },
      ],
      starterActions: [
        {
          kind: "prompt",
          label: "How can I get hired faster?",
          starterActionId: "job_seeker_hired_faster",
        },
        {
          kind: "prompt",
          label: "Why is this a secure career identity platform?",
          starterActionId: "job_seeker_secure_identity",
        },
        {
          accent: "jobs",
          kind: "latest_jobs",
          label: "Find NEW Jobs",
        },
        {
          kind: "prompt",
          label: "What does the agent actually do?",
          starterActionId: "job_seeker_agent_explainer",
        },
        {
          kind: "prompt",
          label: "How is this different from a resume builder?",
          starterActionId: "job_seeker_resume_builder_difference",
        },
        {
          accent: "primary",
          kind: "link",
          href: "/agent-build",
          label: "Start Building My Career ID",
        },
      ],
      typingLabel: "Thinking through your next move...",
    },
    heroTitle: "Get hired faster\nwith trusted proof you can reuse everywhere.",
    introPrimaryCta: "Explore the platform",
    introRailEyebrow: "How Career AI works",
    introRailItems: [
      {
        label: "Persistent Agent IDs",
        copy: "One durable trust object follows the candidate across applications and review loops.",
      },
      {
        label: "Structured proof capture",
        copy: "Employment, education, and certification claims stay attached to evidence and provenance.",
      },
      {
        label: "Shareable trust surfaces",
        copy: "Recruiter-facing views show only what is verified and explicitly shared.",
      },
    ],
    introRailLead:
      "Career AI helps candidates prove credibility faster and helps recruiters review what is actually verified, not just what is claimed.",
    introSecondaryCta: "See recruiter experiences",
    introTitleLines: [
      { text: "Bring" },
      { text: "your proof" },
      { text: "together so" },
      { highlight: true, text: "recruiters" },
      { highlight: true, text: "can trust" },
      { highlight: true, text: "it faster." },
    ],
    metrics: [
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
    ],
    metricsEyebrow: "Built to make trust explicit",
    metricsTitle: "The trust layer for modern hiring.",
    proofSurfaces: [
      "Employment",
      "Education",
      "Certifications",
      "Endorsements",
      {
        label: "Agent QR",
        note: "coming soon…",
      },
      "Audit trail",
    ],
    scrollStory: {
      eyebrow: "Scroll story",
      intro:
        "This is the simplest version of the pitch: collect your career proof once, verify what matters, share the recruiter-safe view, then let the agent move faster with real context.",
      steps: [
        {
          body:
            "Offer letters, diplomas, certifications, references, and work history stop living in scattered tabs, inboxes, and screenshots.",
          id: "collect",
          label: "Collect",
          title: "Start with the career proof you already have.",
        },
        {
          body:
            "Every claim stays attached to evidence, provenance, and status so the profile gets stronger without creating duplicate versions of the same story.",
          id: "verify",
          label: "Verify",
          title: "Turn documents into evidence-backed trust.",
        },
        {
          body:
            "Career AI projects a clean trust profile that shows what is verified and only what you chose to share with employers.",
          id: "share",
          label: "Share",
          title: "Give recruiters a readable view instead of raw document chaos.",
        },
        {
          body:
            "When the agent knows what is actually true, it can search, apply, and follow up with stronger signal and less guesswork.",
          id: "move",
          label: "Move",
          title: "Use verified context to move through hiring faster.",
        },
      ],
      title: "From scattered proof to a Career ID you can reuse anywhere.",
      cta: {
        href: "/agent-build",
        label: "Build Career ID",
      },
      secondaryCta: {
        href: "#solutions",
        label: "See Trust Workflows",
      },
    },
    sectionEyebrow: "How the trust loop works",
    solutionHeading: "Flexible trust workflows for every hiring model.",
    solutionSubheading:
      "Grow candidate confidence and recruiter clarity with modular identity, verification, and sharing surfaces.",
    solutions: [
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
        title: "Issue portable Career AI identities with a trust layer built in",
        copy:
          "One candidate, one persistent identity object, one reusable trust surface across applications.",
        cta: "View the Agent ID model",
        icon: ShieldCheck,
        variant: "agentIdCard",
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
    ],
    stories: [
      {
        comingSoon: true,
        company: "Coming soon...",
        title: "Hiring partner stories will appear here once they are live.",
        copy: "We will replace this placeholder with real partner examples as they launch.",
        cta: "Coming soon...",
        theme: "aura",
      },
      {
        comingSoon: true,
        company: "Coming soon...",
        title: "Hiring partner stories will appear here once they are live.",
        copy: "We will replace this placeholder with real partner examples as they launch.",
        cta: "Coming soon...",
        theme: "stream",
      },
      {
        comingSoon: true,
        company: "Coming soon...",
        title: "Hiring partner stories will appear here once they are live.",
        copy: "We will replace this placeholder with real partner examples as they launch.",
        cta: "Coming soon...",
        theme: "grid",
      },
      {
        comingSoon: true,
        company: "Coming soon...",
        title: "Hiring partner stories will appear here once they are live.",
        copy: "We will replace this placeholder with real partner examples as they launch.",
        cta: "Coming soon...",
        theme: "orb",
      },
    ],
    storyCopy:
      "Launch-partner examples will replace these placeholders as they go live. For now, the scroll story above is the clearest look at how the trust loop works end to end.",
    storyEyebrow: "Launch stories",
    storyTitle: "Real partner examples will appear here as Career AI rolls out.",
    trustExplainer: {
      ...sharedTrustExplainerContent,
      cta: {
        href: "/agent-build",
        label: "Start Building Career ID",
      },
    },
  },
};
