import type { CareerEvidenceTemplateId, VerificationStatus } from "@/packages/contracts/src";
import {
  attachArtifactToClaim,
  getArtifactContentByteLength,
  getArtifactMetadata,
  listArtifactsForClaim,
  uploadArtifact,
} from "@/packages/artifact-domain/src";
import {
  createEmploymentClaim,
  getClaimDetails,
  listClaimDetails,
} from "@/packages/credential-domain/src";
import { updatePrivacySettings } from "@/packages/identity-domain/src";
import {
  completePersistentOnboarding,
  provisionGoogleUser,
  refreshPersistentRecruiterCandidateProjection,
  updateCareerProfileBasics,
  updateRoleSelection,
  upsertPersistentCareerBuilderEvidence,
  upsertPersistentCareerBuilderProfile,
} from "@/packages/persistence/src";
import {
  addProvenanceRecord,
  listProvenanceRecords,
  transitionVerificationRecord,
} from "@/packages/verification-domain/src";
import { generateRecruiterTrustProfile } from "./service";
import { getRecruiterReadModelStore } from "./store";

const RECRUITER_DEMO_DATASET_VERSION = "recruiter-demo-2026-04-v1";
const DEFAULT_RECRUITER_DEMO_CANDIDATE_COUNT = 200;
const RECRUITER_DEMO_SEED_BATCH_SIZE = 8;
const DEMO_ACTOR_ID = "system:recruiter-demo-dataset";
const DEMO_SHARE_BASE_URL = "https://careerai.demo";
const EMPLOYMENT_EVIDENCE_TEMPLATES: CareerEvidenceTemplateId[] = [
  "offer-letters",
  "employment-history-reports",
];

const FIRST_NAMES = [
  "Aaliyah",
  "Adrian",
  "Aisha",
  "Alejandro",
  "Alex",
  "Amara",
  "Andre",
  "Anika",
  "Bianca",
  "Caleb",
  "Carmen",
  "Darius",
  "Devin",
  "Elena",
  "Elijah",
  "Fatima",
  "Gabriel",
  "Hannah",
  "Imani",
  "Isaac",
  "Jada",
  "Javier",
  "Jordan",
  "Kayla",
  "Lena",
  "Lucas",
  "Maya",
  "Micah",
  "Nadia",
  "Naomi",
  "Omar",
  "Priya",
  "Rafael",
  "Sabrina",
  "Samir",
  "Sofia",
  "Talia",
  "Theo",
  "Vanessa",
  "Zane",
];

const LAST_NAMES = [
  "Adams",
  "Brooks",
  "Campos",
  "Chandra",
  "Chen",
  "Collins",
  "Diaz",
  "Edwards",
  "Flores",
  "Garcia",
  "Grant",
  "Gupta",
  "Harrison",
  "Hughes",
  "Jackson",
  "Kim",
  "Lopez",
  "Martin",
  "Mitchell",
  "Morgan",
  "Nguyen",
  "Ortiz",
  "Patel",
  "Perry",
  "Ramirez",
  "Reed",
  "Rivera",
  "Robinson",
  "Shah",
  "Singh",
  "Taylor",
  "Thompson",
  "Turner",
  "Walker",
  "Washington",
  "White",
  "Williams",
  "Wong",
  "Young",
  "Zhang",
];

const LOCATIONS = [
  "Austin, TX",
  "Atlanta, GA",
  "Boston, MA",
  "Chicago, IL",
  "Denver, CO",
  "Los Angeles, CA",
  "Miami, FL",
  "Minneapolis, MN",
  "Nashville, TN",
  "New York, NY",
  "Phoenix, AZ",
  "Raleigh, NC",
  "Remote - US",
  "San Francisco, CA",
  "Seattle, WA",
  "Toronto, ON",
  "Washington, DC",
];

const SIGNATORY_NAMES = [
  "Casey Monroe",
  "Jordan Ellis",
  "Morgan Patel",
  "Taylor Brooks",
  "Avery Kim",
  "Reese Campbell",
];

type VisibilityTier = "searchable" | "limited" | "private";
type SeniorityBand = "associate" | "mid" | "senior" | "lead" | "director";
type CredibilityTier = "emerging" | "evidence_backed" | "high_trust";

type RoleFamily = {
  key: string;
  industries: string[];
  domains: string[];
  employers: string[];
  titles: Record<SeniorityBand, string[]>;
  targetTitles: Record<SeniorityBand, string[]>;
  tools: string[];
  achievements: string[];
};

type PrivacyBlueprint = {
  allowPublicShareLink: boolean;
  allowQrShare: boolean;
  showArtifactPreviews: boolean;
  showEmploymentRecords: boolean;
  showStatusLabels: boolean;
};

type EmploymentBlueprint = {
  artifactCount: number;
  currentlyEmployed: boolean;
  employerName: string;
  endDate: string | null;
  roleTitle: string;
  startDate: string;
  targetStatus: VerificationStatus;
};

type EvidenceBlueprint = {
  employerName: string;
  issuedOn: string;
  roleTitle: string;
  templateId: CareerEvidenceTemplateId;
  validationContext: string;
  whyItMatters: string;
};

type CandidateBlueprint = {
  credibilityTier: CredibilityTier;
  currentEmployer: string;
  currentRole: string;
  email: string;
  employmentHistory: EmploymentBlueprint[];
  evidenceRecords: EvidenceBlueprint[];
  fullName: string;
  imageUrl: string;
  intent: string;
  location: string;
  profileNarrative: string;
  providerUserId: string;
  searchPrompt: string;
  seniorityBand: SeniorityBand;
  skillTerms: string[];
  targetRole: string;
  visibility: VisibilityTier;
};

export type RecruiterDemoSeededCandidate = {
  candidateId: string;
  careerId: string;
  currentEmployer: string;
  currentRole: string;
  fullName: string;
  location: string;
  publicShareToken: string | null;
  searchPrompt: string;
  searchVisible: boolean;
  shareProfileId: string | null;
  skillTerms: string[];
  targetRole: string;
  visibility: VisibilityTier;
};

export type RecruiterDemoDatasetSnapshot = {
  candidates: RecruiterDemoSeededCandidate[];
  fullVisibilityCandidates: number;
  limitedVisibilityCandidates: number;
  loadedAt: string;
  privateCandidates: number;
  searchableCandidates: number;
  shareProfileCount: number;
  totalCandidates: number;
  version: string;
};

type RecruiterDemoDatasetState = {
  loadPromise: Promise<RecruiterDemoDatasetSnapshot> | null;
  snapshot: RecruiterDemoDatasetSnapshot | null;
};

type ArtifactReference = {
  artifactId: string;
  mimeType: string;
  name: string;
  sizeLabel: string;
  uploadedAt: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __taidRecruiterDemoDatasetState: RecruiterDemoDatasetState | undefined;
}

const ROLE_FAMILIES: RoleFamily[] = [
  {
    key: "product",
    industries: ["enterprise SaaS", "AI workflow automation", "fintech platforms"],
    domains: [
      "platform migrations",
      "workflow automation",
      "growth experimentation",
      "enterprise onboarding",
    ],
    employers: ["Atlassian", "HubSpot", "Miro", "Notion", "Ramp", "ServiceNow", "Asana"],
    titles: {
      associate: ["Associate Product Manager", "Product Analyst"],
      mid: ["Product Manager", "Platform Product Manager"],
      senior: ["Senior Product Manager", "Growth Product Lead", "AI Product Manager"],
      lead: ["Group Product Manager", "Principal Product Manager"],
      director: ["Director of Product", "Head of Product"],
    },
    targetTitles: {
      associate: ["Product Manager", "Growth Product Manager"],
      mid: ["Senior Product Manager", "Platform Product Lead"],
      senior: ["Group Product Manager", "Principal Product Manager"],
      lead: ["Director of Product", "Head of Product"],
      director: ["VP Product", "Head of Product Strategy"],
    },
    tools: ["roadmapping", "experimentation", "SQL", "product analytics", "pricing", "OKRs"],
    achievements: [
      "launched self-serve onboarding",
      "improved activation for mid-market teams",
      "cut release coordination time",
      "scaled AI copilots into revenue workflows",
    ],
  },
  {
    key: "software",
    industries: ["developer tools", "cloud infrastructure", "B2B SaaS"],
    domains: ["distributed systems", "platform reliability", "internal tooling", "API design"],
    employers: ["Datadog", "GitLab", "HashiCorp", "MongoDB", "Snowflake", "Twilio", "Vercel"],
    titles: {
      associate: ["Software Engineer", "Full Stack Engineer"],
      mid: ["Software Engineer II", "Backend Engineer", "Frontend Engineer"],
      senior: ["Senior Software Engineer", "Senior Platform Engineer", "Lead Full Stack Engineer"],
      lead: ["Staff Software Engineer", "Principal Engineer", "Engineering Lead"],
      director: ["Director of Engineering", "Head of Platform Engineering"],
    },
    targetTitles: {
      associate: ["Software Engineer II", "Backend Engineer"],
      mid: ["Senior Software Engineer", "Senior Platform Engineer"],
      senior: ["Staff Software Engineer", "Engineering Lead"],
      lead: ["Principal Engineer", "Director of Engineering"],
      director: ["VP Engineering", "Head of Engineering"],
    },
    tools: ["TypeScript", "Node.js", "React", "GraphQL", "Kubernetes", "AWS"],
    achievements: [
      "reduced deployment lead time",
      "stabilized high-volume APIs",
      "rebuilt developer workflow automation",
      "improved platform observability",
    ],
  },
  {
    key: "data",
    industries: ["data infrastructure", "machine learning", "health tech analytics"],
    domains: ["forecasting models", "experimentation pipelines", "feature engineering", "BI"],
    employers: ["Amplitude", "Databricks", "Optum", "Plaid", "Tempus", "Toast", "Workday"],
    titles: {
      associate: ["Business Analyst", "Junior Data Analyst"],
      mid: ["Data Analyst", "Analytics Engineer", "Machine Learning Engineer"],
      senior: ["Senior Data Scientist", "Senior Analytics Engineer", "Senior ML Engineer"],
      lead: ["Lead Data Scientist", "Staff Analytics Engineer", "Principal ML Engineer"],
      director: ["Director of Data", "Head of Analytics"],
    },
    targetTitles: {
      associate: ["Data Analyst", "Analytics Engineer"],
      mid: ["Senior Data Scientist", "Senior Analytics Engineer"],
      senior: ["Lead Data Scientist", "Principal ML Engineer"],
      lead: ["Director of Data", "Head of Analytics"],
      director: ["VP Data", "Head of Decision Science"],
    },
    tools: ["Python", "SQL", "dbt", "Airflow", "TensorFlow", "Looker"],
    achievements: [
      "productionized forecasting pipelines",
      "cut manual reporting cycles",
      "improved model quality in production",
      "aligned experimentation metrics with finance",
    ],
  },
  {
    key: "design",
    industries: ["consumer apps", "B2B SaaS", "commerce platforms"],
    domains: ["design systems", "research synthesis", "product discovery", "conversion flows"],
    employers: ["Canva", "Figma", "Gusto", "Shopify", "Square", "Webflow", "Zapier"],
    titles: {
      associate: ["Product Designer", "UX Designer"],
      mid: ["Senior Product Designer", "UX Researcher", "Brand Systems Designer"],
      senior: ["Lead Product Designer", "Senior UX Researcher", "Design Systems Lead"],
      lead: ["Principal Product Designer", "Staff Designer", "Design Director"],
      director: ["Director of Design", "Head of Design"],
    },
    targetTitles: {
      associate: ["Senior Product Designer", "UX Researcher"],
      mid: ["Lead Product Designer", "Design Systems Lead"],
      senior: ["Principal Product Designer", "Design Director"],
      lead: ["Director of Design", "Head of Design"],
      director: ["VP Design", "Head of Product Design"],
    },
    tools: ["Figma", "design systems", "research ops", "prototyping", "accessibility", "workshops"],
    achievements: [
      "launched end-to-end redesigns",
      "improved onboarding conversion",
      "built scalable component libraries",
      "turned research insights into product bets",
    ],
  },
  {
    key: "marketing",
    industries: ["B2B SaaS", "developer marketing", "growth-stage startups"],
    domains: ["demand generation", "content strategy", "lifecycle programs", "campaign operations"],
    employers: ["Braze", "Carta", "Contentful", "Intercom", "Klaviyo", "Monday.com", "Zendesk"],
    titles: {
      associate: ["Marketing Coordinator", "Growth Marketing Associate"],
      mid: ["Growth Marketing Manager", "Demand Generation Manager", "Content Marketing Manager"],
      senior: ["Senior Growth Marketing Manager", "Senior Demand Gen Lead", "Lifecycle Marketing Lead"],
      lead: ["Principal Growth Lead", "Marketing Director", "Head of Demand Generation"],
      director: ["Director of Marketing", "VP Growth Marketing"],
    },
    targetTitles: {
      associate: ["Growth Marketing Manager", "Demand Generation Manager"],
      mid: ["Senior Growth Marketing Manager", "Lifecycle Marketing Lead"],
      senior: ["Marketing Director", "Head of Demand Generation"],
      lead: ["Director of Marketing", "VP Growth Marketing"],
      director: ["CMO", "VP Marketing"],
    },
    tools: ["HubSpot", "Marketo", "lifecycle email", "content strategy", "paid acquisition", "attribution"],
    achievements: [
      "scaled pipeline from inbound programs",
      "rebuilt lifecycle nurture flows",
      "improved demo conversion rates",
      "tightened campaign reporting for revenue teams",
    ],
  },
  {
    key: "sales",
    industries: ["mid-market SaaS", "fintech", "HR tech"],
    domains: ["new business", "sales operations", "pipeline management", "territory planning"],
    employers: ["DocuSign", "Gong", "Greenhouse", "Okta", "Salesforce", "Zoom", "Rippling"],
    titles: {
      associate: ["Sales Development Representative", "Revenue Operations Associate"],
      mid: ["Account Executive", "Revenue Operations Manager", "Sales Operations Manager"],
      senior: ["Senior Account Executive", "Enterprise Account Executive", "Senior Revenue Operations Lead"],
      lead: ["Sales Director", "Principal Revenue Operations Lead", "Head of Sales Operations"],
      director: ["Director of Sales", "VP Revenue Operations"],
    },
    targetTitles: {
      associate: ["Account Executive", "Revenue Operations Manager"],
      mid: ["Senior Account Executive", "Senior Revenue Operations Lead"],
      senior: ["Sales Director", "Head of Sales Operations"],
      lead: ["Director of Sales", "VP Revenue Operations"],
      director: ["VP Sales", "Chief Revenue Officer"],
    },
    tools: ["Salesforce", "forecasting", "pipeline hygiene", "MEDDICC", "territory planning", "enablement"],
    achievements: [
      "expanded multi-product pipeline coverage",
      "improved forecast accuracy",
      "shortened enterprise sales cycles",
      "built cleaner handoffs between SDR and AE teams",
    ],
  },
  {
    key: "people",
    industries: ["recruiting operations", "high-growth startups", "enterprise hiring"],
    domains: ["full-funnel recruiting", "talent operations", "interview design", "people analytics"],
    employers: ["BetterUp", "Deel", "Eightfold", "Lever", "LinkedIn", "Rippling", "Workday"],
    titles: {
      associate: ["Recruiting Coordinator", "Talent Acquisition Associate"],
      mid: ["Technical Recruiter", "Talent Partner", "People Operations Specialist"],
      senior: ["Senior Technical Recruiter", "Senior Talent Partner", "People Operations Manager"],
      lead: ["Lead Recruiter", "Principal Talent Partner", "Head of Talent Operations"],
      director: ["Director of Talent", "Head of Recruiting"],
    },
    targetTitles: {
      associate: ["Technical Recruiter", "Talent Partner"],
      mid: ["Senior Technical Recruiter", "People Operations Manager"],
      senior: ["Lead Recruiter", "Head of Talent Operations"],
      lead: ["Director of Talent", "Head of Recruiting"],
      director: ["VP Talent", "Chief People Officer"],
    },
    tools: ["Greenhouse", "hiring calibration", "sourcing strategy", "interview loops", "offer closing", "people analytics"],
    achievements: [
      "improved recruiter capacity planning",
      "built structured interview programs",
      "increased offer acceptance rates",
      "reduced time-to-fill for technical roles",
    ],
  },
  {
    key: "customer-success",
    industries: ["customer experience", "implementation services", "B2B SaaS"],
    domains: ["enterprise onboarding", "renewal strategy", "technical implementation", "customer health"],
    employers: ["Asana", "Freshworks", "HubSpot", "Mural", "Qualtrics", "Smartsheet", "Zendesk"],
    titles: {
      associate: ["Customer Success Associate", "Implementation Coordinator"],
      mid: ["Customer Success Manager", "Implementation Manager", "Solutions Consultant"],
      senior: ["Senior Customer Success Manager", "Senior Implementation Lead", "Strategic Account Manager"],
      lead: ["Principal Customer Success Lead", "Customer Experience Director", "Head of Professional Services"],
      director: ["Director of Customer Success", "VP Customer Experience"],
    },
    targetTitles: {
      associate: ["Customer Success Manager", "Implementation Manager"],
      mid: ["Senior Customer Success Manager", "Strategic Account Manager"],
      senior: ["Customer Experience Director", "Head of Professional Services"],
      lead: ["Director of Customer Success", "VP Customer Experience"],
      director: ["Chief Customer Officer", "VP Services"],
    },
    tools: ["QBRs", "renewals", "implementation plans", "health scoring", "SaaS onboarding", "stakeholder management"],
    achievements: [
      "rescued at-risk renewals",
      "improved implementation timelines",
      "built executive business review playbooks",
      "raised product adoption in enterprise accounts",
    ],
  },
  {
    key: "operations",
    industries: ["business operations", "finance systems", "marketplaces"],
    domains: ["operating cadence", "strategic planning", "process redesign", "forecasting"],
    employers: ["Brex", "Chime", "DoorDash", "Instacart", "Mercury", "Stripe", "Uber"],
    titles: {
      associate: ["Business Operations Associate", "Finance Analyst"],
      mid: ["Strategy & Operations Manager", "Finance Manager", "Business Operations Manager"],
      senior: ["Senior Strategy & Operations Manager", "Senior Finance Manager", "Strategic Planning Lead"],
      lead: ["Principal Business Operations Lead", "Director of Finance", "Head of Strategy & Operations"],
      director: ["Director of Operations", "VP Finance Operations"],
    },
    targetTitles: {
      associate: ["Business Operations Manager", "Finance Manager"],
      mid: ["Senior Strategy & Operations Manager", "Strategic Planning Lead"],
      senior: ["Director of Finance", "Head of Strategy & Operations"],
      lead: ["Director of Operations", "VP Finance Operations"],
      director: ["COO Chief of Staff", "VP Business Operations"],
    },
    tools: ["financial modeling", "SQL", "operating reviews", "scenario planning", "process design", "Tableau"],
    achievements: [
      "tightened quarterly planning cycles",
      "improved margin reporting",
      "scaled vendor and partner operations",
      "clarified executive KPI reviews",
    ],
  },
  {
    key: "security",
    industries: ["security operations", "cloud infrastructure", "regulated SaaS"],
    domains: ["incident response", "identity access management", "cloud security", "compliance automation"],
    employers: ["Cloudflare", "CrowdStrike", "Okta", "Palo Alto Networks", "Snyk", "Tanium", "Wiz"],
    titles: {
      associate: ["Security Analyst", "IT Systems Analyst"],
      mid: ["Security Engineer", "Cloud Security Engineer", "IT Infrastructure Engineer"],
      senior: ["Senior Security Engineer", "Senior Cloud Security Engineer", "Detection Engineering Lead"],
      lead: ["Staff Security Engineer", "Principal Security Engineer", "Security Operations Lead"],
      director: ["Director of Security", "Head of Security Engineering"],
    },
    targetTitles: {
      associate: ["Security Engineer", "Cloud Security Engineer"],
      mid: ["Senior Security Engineer", "Detection Engineering Lead"],
      senior: ["Staff Security Engineer", "Security Operations Lead"],
      lead: ["Director of Security", "Head of Security Engineering"],
      director: ["CISO", "VP Security Engineering"],
    },
    tools: ["SIEM", "IAM", "cloud posture", "threat detection", "incident response", "Python"],
    achievements: [
      "reduced incident response times",
      "closed cloud misconfiguration gaps",
      "automated compliance evidence collection",
      "improved access review coverage",
    ],
  },
];

function createDatasetState(): RecruiterDemoDatasetState {
  return {
    loadPromise: null,
    snapshot: null,
  };
}

function getDatasetState() {
  if (!globalThis.__taidRecruiterDemoDatasetState) {
    globalThis.__taidRecruiterDemoDatasetState = createDatasetState();
  }

  return globalThis.__taidRecruiterDemoDatasetState;
}

export function resetRecruiterDemoDatasetState() {
  globalThis.__taidRecruiterDemoDatasetState = createDatasetState();
}

export function getRecruiterDemoDatasetSnapshot() {
  return getDatasetState().snapshot;
}

function getRecruiterDemoCandidateCount() {
  const configuredValue = Number.parseInt(
    process.env.RECRUITER_DEMO_CANDIDATE_COUNT ?? "",
    10,
  );

  if (!Number.isFinite(configuredValue) || configuredValue <= 0) {
    return DEFAULT_RECRUITER_DEMO_CANDIDATE_COUNT;
  }

  return configuredValue;
}

export async function ensureRecruiterDemoDatasetLoaded(): Promise<RecruiterDemoDatasetSnapshot> {
  const state = getDatasetState();

  if (state.snapshot?.version === RECRUITER_DEMO_DATASET_VERSION) {
    return state.snapshot;
  }

  if (!state.loadPromise) {
    state.loadPromise = loadRecruiterDemoDataset()
      .then((snapshot) => {
        state.snapshot = snapshot;
        return snapshot;
      })
      .catch((error) => {
        state.loadPromise = null;
        throw error;
      });
  }

  return state.loadPromise;
}

function normalizeSeed(seed: string) {
  let value = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return value >>> 0;
}

function createRng(seed: string) {
  let state = normalizeSeed(seed) || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;

    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

function pickOne<T>(values: T[], rng: () => number) {
  return values[Math.floor(rng() * values.length) % values.length];
}

function pickDistinct<T>(values: T[], count: number, rng: () => number) {
  const pool = [...values];
  const selected: T[] = [];

  while (pool.length > 0 && selected.length < count) {
    const nextIndex = Math.floor(rng() * pool.length) % pool.length;
    selected.push(pool.splice(nextIndex, 1)[0]);
  }

  return selected;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }

  return `${Math.max(120, Math.round(bytes / 1024))} KB`;
}

function computeVisibility(index: number): VisibilityTier {
  const bucket = index % 20;

  if (bucket < 13) {
    return "searchable";
  }

  if (bucket < 17) {
    return "limited";
  }

  return "private";
}

function computeSeniorityBand(index: number): SeniorityBand {
  const bucket = index % 20;

  if (bucket < 3) {
    return "associate";
  }

  if (bucket < 9) {
    return "mid";
  }

  if (bucket < 15) {
    return "senior";
  }

  if (bucket < 18) {
    return "lead";
  }

  return "director";
}

function computeCredibilityTier(args: {
  index: number;
  seniorityBand: SeniorityBand;
  visibility: VisibilityTier;
}): CredibilityTier {
  if (args.visibility === "private") {
    return args.index % 4 === 0 ? "high_trust" : "evidence_backed";
  }

  if (args.seniorityBand === "lead" || args.seniorityBand === "director") {
    return "high_trust";
  }

  if (args.visibility === "limited") {
    return args.index % 3 === 0 ? "high_trust" : "evidence_backed";
  }

  if (args.index % 5 === 0) {
    return "emerging";
  }

  return args.index % 2 === 0 ? "high_trust" : "evidence_backed";
}

function buildPrivacyBlueprint(visibility: VisibilityTier, index: number): PrivacyBlueprint {
  if (visibility === "private") {
    return {
      allowPublicShareLink: false,
      allowQrShare: false,
      showArtifactPreviews: false,
      showEmploymentRecords: false,
      showStatusLabels: false,
    };
  }

  if (visibility === "limited") {
    return {
      allowPublicShareLink: true,
      allowQrShare: index % 2 === 0,
      showArtifactPreviews: false,
      showEmploymentRecords: false,
      showStatusLabels: false,
    };
  }

  return {
    allowPublicShareLink: true,
    allowQrShare: index % 3 !== 0,
    showArtifactPreviews: index % 4 === 0,
    showEmploymentRecords: true,
    showStatusLabels: index % 5 !== 0,
  };
}

function buildName(index: number) {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];

  return {
    firstName,
    fullName: `${firstName} ${lastName}`,
    lastName,
  };
}

function buildLocation(index: number, familyIndex: number) {
  return LOCATIONS[(index * 3 + familyIndex * 5) % LOCATIONS.length];
}

function buildRoleProgression(args: {
  family: RoleFamily;
  jobsCount: number;
  rng: () => number;
  seniorityBand: SeniorityBand;
}) {
  const order: SeniorityBand[] = ["associate", "mid", "senior", "lead", "director"];
  const endIndex = order.indexOf(args.seniorityBand);
  const startIndex = Math.max(0, endIndex - args.jobsCount + 1);
  const levels = order.slice(startIndex, endIndex + 1);

  while (levels.length < args.jobsCount) {
    levels.unshift(order[Math.max(0, startIndex - 1)] ?? "associate");
  }

  return levels.map((band, levelIndex) => {
    const titles = args.family.titles[band];
    return titles[(levelIndex + Math.floor(args.rng() * titles.length)) % titles.length];
  });
}

function buildEmploymentHistory(args: {
  credibilityTier: CredibilityTier;
  family: RoleFamily;
  index: number;
  rng: () => number;
  seniorityBand: SeniorityBand;
}) {
  const yearsByBand: Record<SeniorityBand, number> = {
    associate: 2,
    mid: 5,
    senior: 8,
    lead: 11,
    director: 14,
  };
  const jobCountByBand: Record<SeniorityBand, number[]> = {
    associate: [1, 2],
    mid: [2, 3],
    senior: [3],
    lead: [3, 4],
    director: [4],
  };
  const targetStatusesByTier: Record<CredibilityTier, VerificationStatus[]> = {
    emerging: ["SUBMITTED", "PARTIALLY_VERIFIED", "REVIEWED"],
    evidence_backed: ["PARTIALLY_VERIFIED", "REVIEWED", "SOURCE_VERIFIED"],
    high_trust: ["REVIEWED", "SOURCE_VERIFIED", "MULTI_SOURCE_VERIFIED"],
  };
  const totalYears = yearsByBand[args.seniorityBand] + (args.index % 3);
  const jobsCount = pickOne(jobCountByBand[args.seniorityBand], args.rng);
  const roleProgression = buildRoleProgression({
    family: args.family,
    jobsCount,
    rng: args.rng,
    seniorityBand: args.seniorityBand,
  });
  const employerPool = pickDistinct(args.family.employers, jobsCount + 1, args.rng);
  const employers = employerPool.slice(0, jobsCount);
  const currentlyEmployed = args.index % 5 !== 0;
  const totalMonths = totalYears * 12;
  const durations = Array.from({ length: jobsCount }, (_, jobIndex) => {
    const jobsRemaining = jobsCount - jobIndex;
    const baseline = Math.round(totalMonths / jobsCount);
    const jitter = Math.round((args.rng() - 0.5) * 8);
    const durationMonths =
      jobsRemaining === 1 ? totalMonths : Math.max(12, Math.min(42, baseline + jitter));
    return durationMonths;
  });
  const usedMonths = durations.reduce((total, value) => total + value, 0);
  const adjustment = totalMonths - usedMonths;
  durations[durations.length - 1] = Math.max(10, durations[durations.length - 1] + adjustment);

  const employmentHistory: EmploymentBlueprint[] = [];
  let cursor = currentlyEmployed
    ? new Date(Date.UTC(2026, 3, 1))
    : new Date(Date.UTC(2026, (args.index % 3) + 1, 1));

  for (let reverseIndex = jobsCount - 1; reverseIndex >= 0; reverseIndex -= 1) {
    const durationMonths = durations[reverseIndex];
    const startDate = shiftMonths(cursor, -durationMonths);
    const isCurrentRole = reverseIndex === jobsCount - 1;
    const artifactCount =
      args.credibilityTier === "high_trust"
        ? isCurrentRole
          ? 2
          : 1 + ((args.index + reverseIndex) % 2)
        : args.credibilityTier === "evidence_backed"
          ? isCurrentRole
            ? 1
            : (args.index + reverseIndex) % 2
          : isCurrentRole && args.index % 2 === 0
            ? 1
            : 0;

    employmentHistory.unshift({
      artifactCount,
      currentlyEmployed: isCurrentRole ? currentlyEmployed : false,
      employerName: employers[reverseIndex],
      endDate: isCurrentRole && currentlyEmployed ? null : formatDate(cursor),
      roleTitle: roleProgression[reverseIndex],
      startDate: formatDate(startDate),
      targetStatus:
        targetStatusesByTier[args.credibilityTier][
          (reverseIndex + args.index) % targetStatusesByTier[args.credibilityTier].length
        ],
    });

    cursor = shiftMonths(startDate, -(1 + ((args.index + reverseIndex) % 3)));
  }

  return employmentHistory;
}

function buildEvidenceRecords(args: {
  credibilityTier: CredibilityTier;
  employmentHistory: EmploymentBlueprint[];
  family: RoleFamily;
  location: string;
  rng: () => number;
  visibility: VisibilityTier;
}) {
  const countByTier: Record<CredibilityTier, number> = {
    emerging: 1,
    evidence_backed: 2,
    high_trust: 4,
  };
  const evidenceCount = Math.min(
    EMPLOYMENT_EVIDENCE_TEMPLATES.length,
    countByTier[args.credibilityTier],
  );
  const selectedTemplates = EMPLOYMENT_EVIDENCE_TEMPLATES.slice(0, evidenceCount);
  const focusDomain = pickOne(args.family.domains, args.rng);
  const selectedEmployment = [...args.employmentHistory].reverse();

  return selectedTemplates.map((templateId, index) => {
    const employment = selectedEmployment[index % selectedEmployment.length];
    const issuerLabel =
      templateId === "employment-history-reports"
        ? `${employment.employerName} verified employment record`
        : employment.employerName;
    const validationContext = `${employment.roleTitle} scope covered ${pickOne(
      args.family.tools,
      args.rng,
    )}, ${pickOne(args.family.tools, args.rng)}, and ${focusDomain} outcomes in ${args.location}.`;
    const whyItMattersBase = `${employment.roleTitle} evidence supports recruiter review for ${pickOne(
      args.family.industries,
      args.rng,
    )} searches and ${pickOne(args.family.achievements, args.rng)}.`;

    return {
      employerName: issuerLabel,
      issuedOn: employment.endDate ?? employment.startDate,
      roleTitle: employment.roleTitle,
      templateId,
      validationContext,
      whyItMatters:
        args.visibility === "searchable"
          ? `${whyItMattersBase} Most recent scope included ${employment.employerName}.`
          : whyItMattersBase,
    };
  });
}

function buildNarrative(args: {
  credibilityTier: CredibilityTier;
  currentEmployer: string;
  currentRole: string;
  family: RoleFamily;
  location: string;
  previousEmployers: string[];
  rng: () => number;
  seniorityBand: SeniorityBand;
  targetRole: string;
  visibility: VisibilityTier;
}) {
  const seniorityCopy: Record<SeniorityBand, string> = {
    associate: "early-career",
    mid: "mid-career",
    senior: "senior",
    lead: "lead-level",
    director: "director-level",
  };
  const toolA = pickOne(args.family.tools, args.rng);
  const toolB = pickOne(args.family.tools, args.rng);
  const domain = pickOne(args.family.domains, args.rng);
  const industry = pickOne(args.family.industries, args.rng);
  const achievement = pickOne(args.family.achievements, args.rng);
  const employerSentence =
    args.visibility === "searchable"
      ? args.previousEmployers.length > 0
        ? `Most recently at ${args.currentEmployer}, with previous stops at ${args.previousEmployers.join(", ")}.`
        : `Most recently at ${args.currentEmployer}.`
      : "Built a recruiter-safe profile that keeps employer specifics private while preserving role and domain context.";
  const trustSentence =
    args.credibilityTier === "high_trust"
      ? "Profile includes multiple evidence-backed employment signals for recruiter review."
      : args.credibilityTier === "evidence_backed"
        ? "Profile includes structured employment history and supporting evidence."
        : "Profile is intentionally emerging but still structured for sourcing demos.";

  return `${args.currentRole} is a ${seniorityCopy[args.seniorityBand]} operator in ${industry} environments, known for ${achievement} through ${toolA}, ${toolB}, and ${domain}. ${employerSentence} Open to ${args.targetRole} opportunities in ${args.location}. ${trustSentence}`;
}

function buildIntent(args: {
  family: RoleFamily;
  rng: () => number;
  targetRole: string;
  visibility: VisibilityTier;
}) {
  const domain = pickOne(args.family.domains, args.rng);
  const skillA = pickOne(args.family.tools, args.rng);
  const skillB = pickOne(args.family.tools, args.rng);

  if (args.visibility === "searchable") {
    return `Open to ${args.targetRole} opportunities focused on ${domain}, ${skillA}, and ${skillB}.`;
  }

  return `Open to recruiter-safe conversations about ${args.targetRole} roles focused on ${domain}, ${skillA}, and ${skillB}.`;
}

function buildSearchPrompt(args: {
  currentEmployer: string;
  currentRole: string;
  location: string;
  skillTerms: string[];
  visibility: VisibilityTier;
}) {
  const terms = [args.currentRole, args.location, ...args.skillTerms.slice(0, 3)];

  if (args.visibility === "searchable") {
    terms.push(args.currentEmployer);
  }

  return terms.join(" ");
}

function buildCandidateBlueprint(index: number): CandidateBlueprint {
  const family = ROLE_FAMILIES[index % ROLE_FAMILIES.length];
  const rng = createRng(`${RECRUITER_DEMO_DATASET_VERSION}:${index}:${family.key}`);
  const visibility = computeVisibility(index);
  const seniorityBand = computeSeniorityBand(index);
  const credibilityTier = computeCredibilityTier({
    index,
    seniorityBand,
    visibility,
  });
  const { firstName, fullName, lastName } = buildName(index);
  const location = buildLocation(index, ROLE_FAMILIES.indexOf(family));
  const employmentHistory = buildEmploymentHistory({
    credibilityTier,
    family,
    index,
    rng,
    seniorityBand,
  });
  const currentRole = employmentHistory[employmentHistory.length - 1]?.roleTitle ?? pickOne(family.titles[seniorityBand], rng);
  const targetRole = pickOne(family.targetTitles[seniorityBand], rng);
  const currentEmployer = employmentHistory[employmentHistory.length - 1]?.employerName ?? family.employers[0];
  const profileNarrative = buildNarrative({
    credibilityTier,
    currentEmployer,
    currentRole,
    family,
    location,
    previousEmployers: employmentHistory
      .slice(0, Math.max(1, employmentHistory.length - 1))
      .map((job) => job.employerName)
      .slice(-2),
    rng,
    seniorityBand,
    targetRole,
    visibility,
  });
  const intent = buildIntent({
    family,
    rng,
    targetRole,
    visibility,
  });
  const skillTerms = pickDistinct(family.tools, 4, rng);
  const evidenceRecords = buildEvidenceRecords({
    credibilityTier,
    employmentHistory,
    family,
    location,
    rng,
    visibility,
  });

  return {
    credibilityTier,
    currentEmployer,
    currentRole,
    email: `candidate-${String(index + 1).padStart(3, "0")}@careerai.demo`,
    employmentHistory,
    evidenceRecords,
    fullName,
    imageUrl: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(fullName)}`,
    intent,
    location,
    profileNarrative,
    providerUserId: `google-recruiter-demo-${slugify(`${firstName}-${lastName}-${index + 1}`)}`,
    searchPrompt: buildSearchPrompt({
      currentEmployer,
      currentRole,
      location,
      skillTerms,
      visibility,
    }),
    seniorityBand,
    skillTerms,
    targetRole,
    visibility,
  };
}

function buildArtifactReferences(artifacts: ArtifactReference[]) {
  return artifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    mimeType: artifact.mimeType,
    name: artifact.name,
    sizeLabel: artifact.sizeLabel,
    uploadedAt: artifact.uploadedAt,
  }));
}

function normalizeOptionalString(value: string | null | undefined) {
  return value ?? null;
}

function buildClaimMatcher(args: {
  employment: EmploymentBlueprint;
}) {
  return (details: Awaited<ReturnType<typeof listClaimDetails>>[number]) =>
    details.employmentRecord.employer_name === args.employment.employerName &&
    details.employmentRecord.role_title === args.employment.roleTitle &&
    details.employmentRecord.start_date === args.employment.startDate &&
    normalizeOptionalString(details.employmentRecord.end_date_optional) ===
      normalizeOptionalString(args.employment.endDate) &&
    details.employmentRecord.currently_employed === args.employment.currentlyEmployed;
}

function getExistingShareProfile(args: { talentIdentityId: string }) {
  return [...getRecruiterReadModelStore().profilesById.values()]
    .filter((profile) => profile.talent_identity_id === args.talentIdentityId)
    .sort((left, right) => right.generated_at.localeCompare(left.generated_at))[0];
}

function getArtifactReferencesForClaim(args: { claimId: string }) {
  return listArtifactsForClaim(args.claimId)
    .map((artifactId) =>
      getArtifactMetadata({
        artifactId,
        correlationId: `artifact_reference:${artifactId}`,
      }),
    )
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))
    .map((artifact) => ({
      artifactId: artifact.artifact_id,
      mimeType: artifact.mime_type,
      name: artifact.original_filename,
      sizeLabel: formatBytes(
        getArtifactContentByteLength({
          artifactId: artifact.artifact_id,
        }),
      ),
      uploadedAt: artifact.uploaded_at,
    }));
}

async function createClaimArtifacts(args: {
  claimId: string;
  employerName: string;
  fullName: string;
  ownerTalentId: string;
  roleTitle: string;
  totalArtifacts: number;
}) {
  const artifacts: ArtifactReference[] = [];

  for (let artifactIndex = 0; artifactIndex < args.totalArtifacts; artifactIndex += 1) {
    const content = [
      "Career AI recruiter demo artifact",
      `Candidate: ${args.fullName}`,
      `Employer: ${args.employerName}`,
      `Role: ${args.roleTitle}`,
      `Bundle: ${artifactIndex + 1}`,
    ].join("\n");
    const fileName = `${slugify(args.employerName)}-${slugify(args.roleTitle)}-${artifactIndex + 1}.pdf`;
    const file = new File([content], fileName, {
      type: "application/pdf",
    });
    const uploaded = await uploadArtifact({
      actorId: DEMO_ACTOR_ID,
      actorType: "system_service",
      correlationId: `artifact:${args.claimId}:${artifactIndex}`,
      file,
      ownerTalentId: args.ownerTalentId,
    });

    attachArtifactToClaim({
      actorId: DEMO_ACTOR_ID,
      actorType: "system_service",
      artifactId: uploaded.artifact.artifact_id,
      claimId: args.claimId,
      correlationId: `artifact-link:${args.claimId}:${artifactIndex}`,
    });

    artifacts.push({
      artifactId: uploaded.artifact.artifact_id,
      mimeType: uploaded.artifact.mime_type,
      name: uploaded.artifact.original_filename,
      sizeLabel: formatBytes(content.length * 80),
      uploadedAt: uploaded.artifact.uploaded_at,
    });
  }

  return artifacts;
}

function buildVerificationPath(targetStatus: VerificationStatus): VerificationStatus[] {
  switch (targetStatus) {
    case "PARTIALLY_VERIFIED":
      return ["PARTIALLY_VERIFIED"];
    case "REVIEWED":
      return ["REVIEWED"];
    case "SOURCE_VERIFIED":
      return ["PENDING_REVIEW", "SOURCE_VERIFIED"];
    case "MULTI_SOURCE_VERIFIED":
      return ["PENDING_REVIEW", "MULTI_SOURCE_VERIFIED"];
    default:
      return [];
  }
}

const verificationStatusOrder: VerificationStatus[] = [
  "NOT_SUBMITTED",
  "SUBMITTED",
  "PARSING",
  "PARSED",
  "PENDING_REVIEW",
  "PARTIALLY_VERIFIED",
  "REVIEWED",
  "SOURCE_VERIFIED",
  "MULTI_SOURCE_VERIFIED",
  "EXPIRED",
  "REJECTED",
  "NEEDS_RESUBMISSION",
];

function getVerificationOrder(status: VerificationStatus) {
  const index = verificationStatusOrder.indexOf(status);

  return index === -1 ? 0 : index;
}

async function ensureClaimVerification(args: {
  claimId: string;
  correlationId: string;
  targetStatus: VerificationStatus;
}) {
  const existing = await getClaimDetails({
    claimId: args.claimId,
    correlationId: args.correlationId,
  }).catch(() => null);

  if (!existing) {
    return;
  }

  const currentStatus = existing.verification.status;

  if (currentStatus === args.targetStatus) {
    return;
  }

  const transitionPath = buildVerificationPath(args.targetStatus).filter(
    (status) => getVerificationOrder(status) > getVerificationOrder(currentStatus),
  );

  for (const status of transitionPath) {
    await transitionVerificationRecord({
      actorId: DEMO_ACTOR_ID,
      actorType: "reviewer_admin",
      correlationId: `${args.correlationId}:${status}`,
      reason: `Recruiter demo dataset bootstrap set verification to ${status}.`,
      reviewerActorId: DEMO_ACTOR_ID,
      targetStatus: status,
      verificationRecordId: existing.verification.id,
    });
  }
}

async function ensureClaimArtifacts(args: {
  claimId: string;
  correlationId: string;
  employerName: string;
  fullName: string;
  ownerTalentId: string;
  roleTitle: string;
  totalArtifacts: number;
}) {
  const existingArtifacts = getArtifactReferencesForClaim({
    claimId: args.claimId,
  });

  if (existingArtifacts.length >= args.totalArtifacts) {
    return existingArtifacts;
  }

  const createdArtifacts = await createClaimArtifacts({
    claimId: args.claimId,
    employerName: args.employerName,
    fullName: args.fullName,
    ownerTalentId: args.ownerTalentId,
    roleTitle: args.roleTitle,
    totalArtifacts: args.totalArtifacts - existingArtifacts.length,
  });

  return [...existingArtifacts, ...createdArtifacts];
}

async function ensureClaimProvenance(args: {
  claimId: string;
  employerName: string;
  roleTitle: string;
  targetStatus: VerificationStatus;
}) {
  const claimDetails = await getClaimDetails({
    claimId: args.claimId,
    correlationId: `claim-provenance:${args.claimId}`,
  }).catch(() => null);

  if (!claimDetails) {
    return;
  }

  const requiredEntries =
    args.targetStatus === "SOURCE_VERIFIED" || args.targetStatus === "MULTI_SOURCE_VERIFIED"
      ? 2
      : args.targetStatus === "REVIEWED" || args.targetStatus === "PARTIALLY_VERIFIED"
        ? 1
        : 0;
  const existingEntries = await listProvenanceRecords({
    verificationRecordId: claimDetails.verification.id,
  });

  for (let provenanceIndex = existingEntries.length; provenanceIndex < requiredEntries; provenanceIndex += 1) {
    await addProvenanceRecord({
      actorId: DEMO_ACTOR_ID,
      actorType: "system_service",
      correlationId: `provenance:${claimDetails.verification.id}:${provenanceIndex}`,
      input: {
        artifactIdOptional: claimDetails.artifactIds[provenanceIndex],
        sourceActorIdOptional: DEMO_ACTOR_ID,
        sourceActorType: provenanceIndex === 0 ? "reviewer_admin" : "system_service",
        sourceDetails: {
          employer: args.employerName,
          roleTitle: args.roleTitle,
          verificationStage: args.targetStatus,
        },
        sourceMethod: provenanceIndex === 0 ? "INTERNAL_REVIEW" : "EMPLOYER_AGENT",
      },
      verificationRecordId: claimDetails.verification.id,
    });
  }
}

async function seedEmploymentClaim(args: {
  candidate: CandidateBlueprint;
  claimIndex: number;
  employment: EmploymentBlueprint;
  ownerTalentId: string;
  soulRecordId: string;
}) {
  const correlationId = `claim:${args.candidate.email}:${args.claimIndex}`;
  const signatoryName =
    SIGNATORY_NAMES[(args.claimIndex + args.candidate.fullName.length) % SIGNATORY_NAMES.length];
  const existing = (await listClaimDetails({
    correlationId,
    soulRecordIdOptional: args.soulRecordId,
  })).find(
    buildClaimMatcher({
      employment: args.employment,
    }),
  );
  const claimId =
    existing?.claimId ??
    (
      await createEmploymentClaim({
        actorId: DEMO_ACTOR_ID,
        actorType: "system_service",
        correlationId,
        input: {
          companyLetterheadDetectedOptional: true,
          currentlyEmployed: args.employment.currentlyEmployed,
          documentDateOptional: args.employment.endDate ?? args.employment.startDate,
          employerDomainOptional: `${slugify(args.employment.employerName)}.com`,
          employerName: args.employment.employerName,
          employmentTypeOptional: "Full-time",
          endDate: args.employment.endDate ?? undefined,
          locationOptional: args.candidate.location,
          roleTitle: args.employment.roleTitle,
          signatoryNameOptional: signatoryName,
          signatoryTitleOptional: "People Operations Manager",
          soulRecordId: args.soulRecordId,
          startDate: args.employment.startDate,
        },
      })
    ).claim.id;
  const artifacts = await ensureClaimArtifacts({
    claimId,
    correlationId,
    employerName: args.employment.employerName,
    fullName: args.candidate.fullName,
    ownerTalentId: args.ownerTalentId,
    roleTitle: args.employment.roleTitle,
    totalArtifacts: args.employment.artifactCount,
  });
  await ensureClaimVerification({
    claimId,
    correlationId,
    targetStatus: args.employment.targetStatus,
  });
  await ensureClaimProvenance({
    claimId,
    employerName: args.employment.employerName,
    roleTitle: args.employment.roleTitle,
    targetStatus: args.employment.targetStatus,
  });

  return {
    artifacts,
    claimId,
  };
}

async function seedCandidate(blueprint: CandidateBlueprint, index: number) {
  const provisioned = await provisionGoogleUser({
    correlationId: `provision:${blueprint.email}`,
    email: blueprint.email,
    emailVerified: true,
    firstName: blueprint.fullName.split(" ")[0] ?? blueprint.fullName,
    fullName: blueprint.fullName,
    imageUrl: blueprint.imageUrl,
    lastName: blueprint.fullName.split(" ").slice(1).join(" ") || "Candidate",
    providerUserId: blueprint.providerUserId,
  });
  const talentIdentityId = provisioned.context.aggregate.talentIdentity.id;
  const soulRecordId = provisioned.context.aggregate.soulRecord.id;
  const privacy = buildPrivacyBlueprint(blueprint.visibility, index);

  await updateRoleSelection({
    correlationId: `role:${blueprint.email}`,
    roleType: "candidate",
    skipProjectionRefreshOptional: true,
    userId: provisioned.context.user.id,
  });
  await updateCareerProfileBasics({
    correlationId: `profile:${blueprint.email}`,
    profilePatch: {
      headline: blueprint.currentRole,
      intent: blueprint.intent,
      location: blueprint.location,
      recruiterVisibility: blueprint.visibility,
    },
    skipProjectionRefreshOptional: true,
    userId: provisioned.context.user.id,
  });
  await completePersistentOnboarding({
    correlationId: `complete:${blueprint.email}`,
    skipProjectionRefreshOptional: true,
    userId: provisioned.context.user.id,
  });
  await updatePrivacySettings({
    actorId: DEMO_ACTOR_ID,
    actorType: "system_service",
    correlationId: `privacy:${blueprint.email}`,
    input: privacy,
    skipProjectionRefreshOptional: true,
    talentIdentityId,
  });
  await upsertPersistentCareerBuilderProfile({
    careerIdentityId: talentIdentityId,
    input: {
      careerHeadline: blueprint.currentRole,
      coreNarrative: blueprint.profileNarrative,
      legalName: blueprint.fullName,
      location: blueprint.location,
      targetRole: blueprint.targetRole,
    },
    skipProjectionRefreshOptional: true,
    soulRecordId,
  });

  const claimArtifacts = new Map<string, ArtifactReference[]>();

  for (let employmentIndex = 0; employmentIndex < blueprint.employmentHistory.length; employmentIndex += 1) {
    const employment = blueprint.employmentHistory[employmentIndex];
    const seededClaim = await seedEmploymentClaim({
      candidate: blueprint,
      claimIndex: employmentIndex,
      employment,
      ownerTalentId: talentIdentityId,
      soulRecordId,
    });

    claimArtifacts.set(
      `${employment.employerName}:${employment.roleTitle}`,
      seededClaim.artifacts,
    );
  }

  for (let evidenceIndex = 0; evidenceIndex < blueprint.evidenceRecords.length; evidenceIndex += 1) {
    const evidence = blueprint.evidenceRecords[evidenceIndex];
    const files = claimArtifacts.get(`${evidence.employerName.replace(/ verified employment record$/, "")}:${evidence.roleTitle}`) ?? [];

    await upsertPersistentCareerBuilderEvidence({
      careerIdentityId: talentIdentityId,
      record: {
        completionTier: "document",
        createdAt: new Date(Date.UTC(2026, 0, evidenceIndex + 1)).toISOString(),
        files: buildArtifactReferences(files),
        id: `demo_evidence_${slugify(blueprint.email)}_${evidence.templateId}`,
        issuedOn: evidence.issuedOn,
        soulRecordId,
        sourceOrIssuer: evidence.employerName,
        status: "COMPLETE",
        talentIdentityId,
        templateId: evidence.templateId,
        updatedAt: new Date(Date.UTC(2026, 1, evidenceIndex + 1)).toISOString(),
        validationContext: evidence.validationContext,
        whyItMatters: evidence.whyItMatters,
      },
      skipProjectionRefreshOptional: true,
      soulRecordId,
    });
  }

  await refreshPersistentRecruiterCandidateProjection({
    careerIdentityId: talentIdentityId,
  });

  let shareProfileId: string | null = null;
  let publicShareToken: string | null = null;

  if (privacy.allowPublicShareLink) {
    const existingProfile = getExistingShareProfile({
      talentIdentityId,
    });

    if (existingProfile) {
      shareProfileId = existingProfile.id;
      publicShareToken = existingProfile.public_share_token;
    } else {
      const profile = await generateRecruiterTrustProfile({
        actorId: DEMO_ACTOR_ID,
        actorType: "system_service",
        correlationId: `share:${blueprint.email}`,
        input: {
          baseUrlOptional: DEMO_SHARE_BASE_URL,
          talentIdentityId,
        },
      });
      shareProfileId = profile.id;
      publicShareToken = profile.publicShareToken;
    }
  }

  return {
    candidateId: talentIdentityId,
    careerId: provisioned.context.aggregate.talentIdentity.talent_agent_id,
    currentEmployer: blueprint.currentEmployer,
    currentRole: blueprint.currentRole,
    fullName: blueprint.fullName,
    location: blueprint.location,
    publicShareToken,
    searchPrompt: blueprint.searchPrompt,
    searchVisible: blueprint.visibility !== "private",
    shareProfileId,
    skillTerms: blueprint.skillTerms,
    targetRole: blueprint.targetRole,
    visibility: blueprint.visibility,
  } satisfies RecruiterDemoSeededCandidate;
}

async function loadRecruiterDemoDataset(): Promise<RecruiterDemoDatasetSnapshot> {
  const candidateCount = getRecruiterDemoCandidateCount();
  const blueprints = Array.from({ length: candidateCount }, (_, index) =>
    buildCandidateBlueprint(index),
  );
  const seededCandidates = new Array<RecruiterDemoSeededCandidate>(blueprints.length);

  for (let startIndex = 0; startIndex < blueprints.length; startIndex += RECRUITER_DEMO_SEED_BATCH_SIZE) {
    const batch = blueprints.slice(startIndex, startIndex + RECRUITER_DEMO_SEED_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((blueprint, batchIndex) => seedCandidate(blueprint, startIndex + batchIndex)),
    );

    batchResults.forEach((candidate, batchIndex) => {
      seededCandidates[startIndex + batchIndex] = candidate;
    });
  }

  const searchableCandidates = seededCandidates.filter((candidate) => candidate.searchVisible).length;
  const limitedVisibilityCandidates = seededCandidates.filter(
    (candidate) => candidate.visibility === "limited",
  ).length;
  const privateCandidates = seededCandidates.filter(
    (candidate) => candidate.visibility === "private",
  ).length;
  const fullVisibilityCandidates = seededCandidates.filter(
    (candidate) => candidate.visibility === "searchable",
  ).length;

  return {
    candidates: seededCandidates,
    fullVisibilityCandidates,
    limitedVisibilityCandidates,
    loadedAt: new Date().toISOString(),
    privateCandidates,
    searchableCandidates,
    shareProfileCount: seededCandidates.filter((candidate) => candidate.shareProfileId).length,
    totalCandidates: seededCandidates.length,
    version: RECRUITER_DEMO_DATASET_VERSION,
  };
}
