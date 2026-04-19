import type { RecruiterJobPermissionScope } from "@/packages/contracts/src";

export const RECRUITER_MARKETPLACE_SEED_KEY = "synthetic_recruiter_marketplace";
export const RECRUITER_MARKETPLACE_SEED_VERSION = "2026-04-19.synthetic.v1";

export const DEFAULT_RECRUITER_PERMISSION_SCOPES: RecruiterJobPermissionScope[] = [
  "view_jobs",
  "chat_about_jobs",
  "match_against_my_career_id",
  "request_review",
];

export type EmployerPartnerSeedSpec = {
  displayName: string;
  id: string;
  slug: string;
  websiteUrl: string;
};

export type RecruiterIdentitySeedSpec = {
  agentId: string;
  bio: string;
  companyName: string;
  displayName: string;
  employerPartnerId: string;
  id: string;
  recruiterRoleTitle: string;
};

export type RecruiterOwnedJobSeedSpec = {
  compensationCurrency: string;
  compensationMax: number;
  compensationMin: number;
  department: string;
  description: string;
  employerPartnerId: string;
  employmentType: string;
  id: string;
  location: string;
  preferredQualifications: string[];
  qualifications: string[];
  recruiterCareerIdentityId: string;
  responsibilities: string[];
  searchableText: string;
  seniority: string;
  title: string;
};

type RoleTemplate = {
  baseCompMax: number;
  baseCompMin: number;
  department: string;
  employmentType: string;
  preferredQualifications: string[];
  qualifications: string[];
  responsibilities: string[];
  seniority: string;
  title: string;
};

type CompanyFocus = {
  focusArea: string;
  marketContext: string;
};

const recruiterFirstNames = [
  "Avery",
  "Jordan",
  "Morgan",
  "Casey",
  "Riley",
  "Taylor",
  "Cameron",
  "Parker",
  "Quinn",
  "Alex",
  "Hayden",
  "Emerson",
  "Kai",
  "Rowan",
];

const recruiterLastNames = [
  "Patel",
  "Nguyen",
  "Johnson",
  "Garcia",
  "Williams",
  "Lee",
  "Martinez",
  "Taylor",
  "Brown",
  "Chen",
  "Kim",
  "Davis",
  "Singh",
  "Walker",
];

const recruiterRoleTitles = [
  "Principal Technical Recruiter",
  "Senior Talent Partner",
  "Lead Hiring Strategist",
  "AI Talent Acquisition Lead",
  "Global Engineering Recruiter",
  "Staff Recruiting Partner",
  "Technical Talent Director",
];

const defaultLocations = [
  "Remote - United States",
  "San Francisco, CA",
  "Seattle, WA",
  "Austin, TX",
  "New York, NY",
  "Chicago, IL",
  "Atlanta, GA",
  "Denver, CO",
  "Raleigh, NC",
  "Boston, MA",
];

const roleTemplates: RoleTemplate[] = [
  {
    title: "Senior Machine Learning Platform Engineer",
    department: "AI Platform Engineering",
    employmentType: "Full-time",
    seniority: "Senior",
    baseCompMin: 185000,
    baseCompMax: 250000,
    responsibilities: [
      "Own scalable training and inference infrastructure for production AI workloads.",
      "Partner with product and research teams to productionize retrieval and ranking services.",
      "Improve observability, reliability, and deployment velocity for model-serving systems.",
      "Mentor engineers on platform architecture and secure AI delivery standards.",
    ],
    qualifications: [
      "5+ years building distributed backend systems in cloud environments.",
      "Hands-on experience with model serving, vector retrieval, or data pipelines.",
      "Strong TypeScript, Python, or Go engineering fundamentals.",
      "Track record shipping resilient services with latency and reliability targets.",
    ],
    preferredQualifications: [
      "Experience with enterprise AI governance and compliance controls.",
      "Prior ownership of multi-tenant infrastructure with strict authorization boundaries.",
      "Familiarity with Kubernetes-based ML workloads and feature stores.",
    ],
  },
  {
    title: "Staff Backend Engineer, Platform Integrations",
    department: "Core Platform",
    employmentType: "Full-time",
    seniority: "Staff",
    baseCompMin: 195000,
    baseCompMax: 275000,
    responsibilities: [
      "Design and ship mission-critical APIs for partner integrations.",
      "Lead architecture for secure data access and service orchestration.",
      "Drive incident readiness and long-term reliability improvements.",
      "Collaborate with product, security, and infrastructure teams.",
    ],
    qualifications: [
      "7+ years building and operating production backend services.",
      "Experience with API lifecycle management and event-driven architecture.",
      "Strong SQL and relational data modeling fundamentals.",
      "Proven ability to lead cross-functional technical initiatives.",
    ],
    preferredQualifications: [
      "Experience integrating ATS or enterprise HR systems.",
      "Background in multi-region service architecture.",
      "Familiarity with typed contract-driven API development.",
    ],
  },
  {
    title: "Principal Product Manager, Recruiter Experience",
    department: "Product",
    employmentType: "Full-time",
    seniority: "Principal",
    baseCompMin: 180000,
    baseCompMax: 245000,
    responsibilities: [
      "Own roadmap execution for recruiter discovery and matching workflows.",
      "Translate customer research into measurable product bets.",
      "Align engineering, design, and GTM teams on priorities.",
      "Define metrics and quality standards for recruiter productivity.",
    ],
    qualifications: [
      "6+ years in product management for B2B or enterprise software.",
      "Strong collaboration with engineering teams delivering platform features.",
      "Experience with experimentation and analytics.",
      "Excellent communication across technical and business stakeholders.",
    ],
    preferredQualifications: [
      "Prior ownership in recruiting, HR tech, or marketplace products.",
      "Experience launching AI-assisted workflow products.",
      "Familiarity with permissioned data products and auditability.",
    ],
  },
  {
    title: "Senior Security Engineer, Identity and Access",
    department: "Security Engineering",
    employmentType: "Full-time",
    seniority: "Senior",
    baseCompMin: 175000,
    baseCompMax: 235000,
    responsibilities: [
      "Build security controls for identity and sensitive data access.",
      "Partner with platform teams on secure-by-default patterns.",
      "Lead threat modeling and remediation for high-risk product surfaces.",
      "Develop detection and response playbooks for access abuse.",
    ],
    qualifications: [
      "5+ years in security engineering or application security.",
      "Experience implementing IAM and permission controls.",
      "Strong understanding of secure software lifecycle practices.",
      "Ability to communicate risk and remediation clearly.",
    ],
    preferredQualifications: [
      "Experience with SOC2, ISO 27001, or similar compliance programs.",
      "Background in secure multi-tenant SaaS architecture.",
      "Familiarity with audit-event pipelines and incident forensics.",
    ],
  },
  {
    title: "Lead Data Engineer, Talent Intelligence",
    department: "Data Platform",
    employmentType: "Full-time",
    seniority: "Lead",
    baseCompMin: 170000,
    baseCompMax: 230000,
    responsibilities: [
      "Design pipelines powering matching and recruiter analytics.",
      "Build robust data contracts and quality checks.",
      "Own data model performance for search and recommendation workloads.",
      "Collaborate with analytics and ML partners on feature readiness.",
    ],
    qualifications: [
      "5+ years building reliable data pipelines and warehouse models.",
      "Expertise with SQL, ETL orchestration, and cloud data infrastructure.",
      "Experience with event-driven ingestion and schema evolution.",
      "Strong debugging skills across distributed data systems.",
    ],
    preferredQualifications: [
      "Familiarity with vector indexing and retrieval pipelines.",
      "Experience with dbt, Airflow, or comparable tooling.",
      "Exposure to recruiting operations datasets.",
    ],
  },
  {
    title: "Solutions Architect, Enterprise Integrations",
    department: "Solutions Engineering",
    employmentType: "Full-time",
    seniority: "Senior",
    baseCompMin: 160000,
    baseCompMax: 220000,
    responsibilities: [
      "Guide enterprise onboarding and systems integration.",
      "Design reference architectures for secure deployments.",
      "Partner with product teams to close platform gaps.",
      "Deliver technical enablement for strategic partners.",
    ],
    qualifications: [
      "5+ years in solutions architecture or technical consulting.",
      "Strong understanding of cloud architectures and API integrations.",
      "Ability to influence technical stakeholders across enterprise accounts.",
      "Clear written and verbal communication skills.",
    ],
    preferredQualifications: [
      "Experience integrating with Workday, Salesforce, or ATS ecosystems.",
      "Background in identity and access management architecture.",
      "Prior work in talent platforms.",
    ],
  },
  {
    title: "Senior Frontend Engineer, Talent Workflows",
    department: "Product Engineering",
    employmentType: "Full-time",
    seniority: "Senior",
    baseCompMin: 165000,
    baseCompMax: 225000,
    responsibilities: [
      "Build recruiter workflows for discovery and guided decisions.",
      "Collaborate with design on accessibility and usability.",
      "Optimize performance for high-engagement product surfaces.",
      "Contribute to shared UI primitives and frontend standards.",
    ],
    qualifications: [
      "5+ years building production frontend applications.",
      "Strong React and TypeScript experience.",
      "Experience integrating typed APIs and complex client state.",
      "Commitment to accessibility and interaction quality.",
    ],
    preferredQualifications: [
      "Experience building enterprise UX with role-based access controls.",
      "Familiarity with modern React testing strategies.",
      "Exposure to AI-assisted product experiences.",
    ],
  },
  {
    title: "Staff DevOps Engineer, Developer Platform",
    department: "Infrastructure",
    employmentType: "Full-time",
    seniority: "Staff",
    baseCompMin: 180000,
    baseCompMax: 245000,
    responsibilities: [
      "Improve deployment pipelines and operational tooling.",
      "Lead infrastructure hardening across runtime and CI/CD systems.",
      "Partner with security and platform teams on policy-as-code.",
      "Drive observability standards across shared services.",
    ],
    qualifications: [
      "7+ years in infrastructure, SRE, or DevOps engineering.",
      "Deep knowledge of cloud infrastructure automation.",
      "Experience improving reliability through metrics and tracing.",
      "Strong scripting and systems debugging skills.",
    ],
    preferredQualifications: [
      "Experience with Kubernetes, Terraform, and policy tooling.",
      "Background supporting high-scale SaaS systems.",
      "Familiarity with compliance-conscious infrastructure controls.",
    ],
  },
  {
    title: "Lead Product Designer, AI Assistant Experiences",
    department: "Design",
    employmentType: "Full-time",
    seniority: "Lead",
    baseCompMin: 155000,
    baseCompMax: 210000,
    responsibilities: [
      "Own UX for recruiter AI workflows and decision support interfaces.",
      "Translate research into interaction models and product patterns.",
      "Collaborate with PM and engineering to ship cohesive experiences.",
      "Develop design-system guidance for enterprise use cases.",
    ],
    qualifications: [
      "5+ years in product design with B2B software products.",
      "Strong systems thinking, interaction design, and prototyping skills.",
      "Experience collaborating in cross-functional product squads.",
      "Comfort with qualitative and quantitative research synthesis.",
    ],
    preferredQualifications: [
      "Experience designing AI copilots or workflow automation tools.",
      "Prior work in recruiting or enterprise operations products.",
      "Familiarity with accessibility-first design practices.",
    ],
  },
  {
    title: "Senior Technical Program Manager, Partner Delivery",
    department: "Program Management",
    employmentType: "Full-time",
    seniority: "Senior",
    baseCompMin: 150000,
    baseCompMax: 205000,
    responsibilities: [
      "Run cross-functional programs for employer partner onboarding.",
      "Coordinate milestones across product, engineering, and GTM teams.",
      "Define delivery plans, risk tracking, and launch readiness.",
      "Drive post-launch retrospectives and improvement loops.",
    ],
    qualifications: [
      "5+ years in technical program management for software products.",
      "Strong experience coordinating multi-team delivery programs.",
      "Ability to communicate technical risk and mitigation.",
      "Bias for execution and operational rigor.",
    ],
    preferredQualifications: [
      "Experience with enterprise implementation programs.",
      "Background in integration-heavy platforms.",
      "Familiarity with recruiting workflows and ecosystem tooling.",
    ],
  },
];

const companyFocusMap: Record<string, CompanyFocus> = {
  accenture: {
    focusArea: "enterprise transformation",
    marketContext: "global consulting-led digital delivery",
  },
  adobe: {
    focusArea: "creative and document intelligence platforms",
    marketContext: "cloud product innovation at global scale",
  },
  autodesk: {
    focusArea: "design and engineering software ecosystems",
    marketContext: "product-led platform modernization",
  },
  cisco: {
    focusArea: "networking, collaboration, and secure infrastructure",
    marketContext: "enterprise platform reliability",
  },
  crowdstrike: {
    focusArea: "cybersecurity detection and response",
    marketContext: "security-first cloud product execution",
  },
  "dell-technologies": {
    focusArea: "infrastructure and hybrid-cloud solutions",
    marketContext: "enterprise technology operations",
  },
  figma: {
    focusArea: "collaborative product design and developer workflows",
    marketContext: "high-growth product velocity",
  },
  "hewlett-packard-enterprise": {
    focusArea: "enterprise compute and cloud operations",
    marketContext: "large-scale platform transformation",
  },
  nvidia: {
    focusArea: "accelerated computing and AI systems",
    marketContext: "high-performance AI platform delivery",
  },
  "red-hat": {
    focusArea: "open-source cloud platform engineering",
    marketContext: "hybrid cloud enterprise enablement",
  },
  salesforce: {
    focusArea: "customer platform and workflow cloud ecosystems",
    marketContext: "multi-product enterprise SaaS growth",
  },
  "samsung-electronics": {
    focusArea: "consumer and enterprise device ecosystems",
    marketContext: "global product and platform operations",
  },
  stripe: {
    focusArea: "payments and financial infrastructure",
    marketContext: "developer-first fintech platform execution",
  },
  workday: {
    focusArea: "enterprise workforce and finance systems",
    marketContext: "mission-critical SaaS operations",
  },
};

export const employerPartnerSeedConfig: EmployerPartnerSeedSpec[] = [
  { id: "emp_accenture", slug: "accenture", displayName: "Accenture", websiteUrl: "https://www.accenture.com" },
  { id: "emp_adobe", slug: "adobe", displayName: "Adobe", websiteUrl: "https://www.adobe.com" },
  { id: "emp_autodesk", slug: "autodesk", displayName: "Autodesk", websiteUrl: "https://www.autodesk.com" },
  { id: "emp_cisco", slug: "cisco", displayName: "Cisco", websiteUrl: "https://www.cisco.com" },
  { id: "emp_crowdstrike", slug: "crowdstrike", displayName: "CrowdStrike", websiteUrl: "https://www.crowdstrike.com" },
  { id: "emp_dell_technologies", slug: "dell-technologies", displayName: "Dell Technologies", websiteUrl: "https://www.dell.com" },
  { id: "emp_figma", slug: "figma", displayName: "Figma", websiteUrl: "https://www.figma.com" },
  { id: "emp_hewlett_packard_enterprise", slug: "hewlett-packard-enterprise", displayName: "Hewlett Packard Enterprise", websiteUrl: "https://www.hpe.com" },
  { id: "emp_nvidia", slug: "nvidia", displayName: "NVIDIA", websiteUrl: "https://www.nvidia.com" },
  { id: "emp_red_hat", slug: "red-hat", displayName: "Red Hat", websiteUrl: "https://www.redhat.com" },
  { id: "emp_salesforce", slug: "salesforce", displayName: "Salesforce", websiteUrl: "https://www.salesforce.com" },
  { id: "emp_samsung_electronics", slug: "samsung-electronics", displayName: "Samsung Electronics", websiteUrl: "https://www.samsung.com" },
  { id: "emp_stripe", slug: "stripe", displayName: "Stripe", websiteUrl: "https://www.stripe.com" },
  { id: "emp_workday", slug: "workday", displayName: "Workday", websiteUrl: "https://www.workday.com" },
];

export function getRecruiterMarketplaceCompanyNames() {
  return employerPartnerSeedConfig.map((partner) => partner.displayName);
}

function chooseRecruiterIdentityName(index: number) {
  const firstName = recruiterFirstNames[index % recruiterFirstNames.length];
  const lastName = recruiterLastNames[index % recruiterLastNames.length];
  return `${firstName} ${lastName}`;
}

function buildRecruiterBio(args: {
  companyName: string;
  focusArea: string;
  marketContext: string;
  recruiterName: string;
}) {
  return `${args.recruiterName} leads hiring for ${args.companyName}'s ${args.focusArea} teams, partnering with engineering and product leaders to scale ${args.marketContext} initiatives.`;
}

export function buildRecruiterSeedForEmployerPartner(
  partner: EmployerPartnerSeedSpec,
  partnerIndex: number,
): RecruiterIdentitySeedSpec {
  const recruiterName = chooseRecruiterIdentityName(partnerIndex);
  const recruiterRoleTitle = recruiterRoleTitles[partnerIndex % recruiterRoleTitles.length];
  const focus = companyFocusMap[partner.slug] ?? {
    focusArea: "platform engineering and product delivery",
    marketContext: "enterprise product execution",
  };
  const recruiterId = `rec_${partner.slug}_primary`;

  return {
    id: recruiterId,
    agentId: `careerai.agent.recruiter.${recruiterId}`,
    employerPartnerId: partner.id,
    displayName: recruiterName,
    recruiterRoleTitle,
    companyName: partner.displayName,
    bio: buildRecruiterBio({
      companyName: partner.displayName,
      focusArea: focus.focusArea,
      marketContext: focus.marketContext,
      recruiterName,
    }),
  };
}

function buildSearchableText(args: {
  companyName: string;
  description: string;
  location: string;
  preferredQualifications: string[];
  qualifications: string[];
  responsibilities: string[];
  title: string;
}) {
  return [
    args.companyName,
    args.title,
    args.location,
    args.description,
    ...args.responsibilities,
    ...args.qualifications,
    ...args.preferredQualifications,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRecruiterOwnedJobsSeed(args: {
  employerPartner: EmployerPartnerSeedSpec;
  recruiter: RecruiterIdentitySeedSpec;
  partnerIndex: number;
}) {
  const jobs: RecruiterOwnedJobSeedSpec[] = [];
  const companyFocus = companyFocusMap[args.employerPartner.slug] ?? {
    focusArea: "platform innovation",
    marketContext: "enterprise software delivery",
  };

  for (let offset = 0; offset < 10; offset += 1) {
    const template = roleTemplates[(args.partnerIndex + offset) % roleTemplates.length];
    const location = defaultLocations[(args.partnerIndex + offset) % defaultLocations.length];
    const title = template.title;
    const description = `${args.employerPartner.displayName} is hiring a ${title} to advance ${companyFocus.focusArea} priorities across ${companyFocus.marketContext}. This role partners with cross-functional teams to ship measurable product and platform outcomes.`;
    const searchableText = buildSearchableText({
      companyName: args.employerPartner.displayName,
      description,
      location,
      preferredQualifications: template.preferredQualifications,
      qualifications: template.qualifications,
      responsibilities: template.responsibilities,
      title,
    });

    jobs.push({
      id: `rjob_${args.employerPartner.slug}_${offset + 1}`,
      recruiterCareerIdentityId: args.recruiter.id,
      employerPartnerId: args.employerPartner.id,
      title,
      location,
      department: template.department,
      employmentType: template.employmentType,
      seniority: template.seniority,
      compensationMin: template.baseCompMin + offset * 1500,
      compensationMax: template.baseCompMax + offset * 1500,
      compensationCurrency: "USD",
      description,
      responsibilities: template.responsibilities,
      qualifications: template.qualifications,
      preferredQualifications: template.preferredQualifications,
      searchableText,
    });
  }

  return jobs;
}
