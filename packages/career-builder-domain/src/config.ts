import type {
  CareerEvidenceTemplateId,
  CareerPhase,
  EvidenceFileSlot,
} from "@/packages/contracts/src";

export type BuilderEvidenceTemplate = {
  acceptedFormats: string;
  completionTier: CareerPhase;
  contextHint: string;
  guidance: string;
  id: CareerEvidenceTemplateId;
  modalPhases: CareerPhase[];
  section: "employment" | "identity" | "network";
  sourceHint: string;
  title: string;
  uploadKind?: "default" | "drivers-license-images";
};

export const phaseSequence = [
  "self",
  "relationship",
  "document",
  "signature",
  "institution",
] as const satisfies readonly CareerPhase[];

export const phaseMeta: Record<
  CareerPhase,
  {
    actionLabel: string;
    description: string;
    label: string;
    modalTitle: string;
    modalSubtitle: string;
    previewLabel: string;
    rank: number;
    supportTitle: string;
  }
> = {
  self: {
    actionLabel: "Save self-reported foundation",
    description: "Capture the profile narrative before trust signals and evidence are attached.",
    label: "Self-reported",
    modalTitle: "Self-reported foundation",
    modalSubtitle:
      "Start with the human-readable identity layer that every later trust signal will reinforce.",
    previewLabel: "self-reported",
    rank: 1,
    supportTitle: "Profile foundation",
  },
  relationship: {
    actionLabel: "Save relationship-backed evidence",
    description: "Show how trusted people describe the work, overlap, and outcomes around your career.",
    label: "Relationship-backed",
    modalTitle: "Relationship-backed evidence",
    modalSubtitle:
      "Bring in referrals, endorsements, and other relationship signals that add social proof around the Career ID.",
    previewLabel: "relationship-backed",
    rank: 2,
    supportTitle: "Trusted relationships",
  },
  document: {
    actionLabel: "Save document-backed evidence",
    description: "Attach role, chronology, and employment proof that can be reviewed directly.",
    label: "Document-backed",
    modalTitle: "Document-backed evidence",
    modalSubtitle:
      "Use formal employment documents to strengthen chronology, role history, and career progression.",
    previewLabel: "document-backed",
    rank: 3,
    supportTitle: "Structured proof",
  },
  signature: {
    actionLabel: "Save signature-backed evidence",
    description: "Add signed or named-signer proof that carries stronger trust at review time.",
    label: "Signature-backed",
    modalTitle: "Signature-backed evidence",
    modalSubtitle:
      "Surface signed documents and named-signer proof without duplicating the underlying evidence records.",
    previewLabel: "signature-backed",
    rank: 4,
    supportTitle: "Named signer trust",
  },
  institution: {
    actionLabel: "Save institution-verified evidence",
    description: "Anchor the Career ID to identity providers and institution-issued verification.",
    label: "Institution-verified",
    modalTitle: "Institution-verified evidence",
    modalSubtitle:
      "Bring in identity anchors and verified proof from institutions or third-party providers.",
    previewLabel: "institution-verified",
    rank: 5,
    supportTitle: "Identity anchors",
  },
};

export const driversLicenseImageSlots = [
  { key: "front", label: "Front of driver's license" },
  { key: "back", label: "Back of driver's license" },
] as const satisfies ReadonlyArray<{
  key: EvidenceFileSlot;
  label: string;
}>;

export const builderEvidenceTemplates: BuilderEvidenceTemplate[] = [
  {
    acceptedFormats: "Verification export, PDF, or screenshot",
    completionTier: "institution",
    contextHint: "What part of identity or employment does this verification anchor?",
    guidance: "Use trusted identity verification to anchor the profile to a real person.",
    id: "idme-verification",
    modalPhases: ["institution"],
    section: "identity",
    sourceHint: "ID.me or linked verification provider",
    title: "ID.me verification",
  },
  {
    acceptedFormats: "Images only",
    completionTier: "institution",
    contextHint: "What should this ID unlock inside the credibility profile?",
    guidance: "Government-issued ID helps bind soul.md to an identity layer before broader sharing begins.",
    id: "drivers-license",
    modalPhases: ["institution"],
    section: "identity",
    sourceHint: "Issuing authority or state",
    title: "Driver's license",
    uploadKind: "drivers-license-images",
  },
  {
    acceptedFormats: "Signed PDF, notarized file, or official agreement",
    completionTier: "signature",
    contextHint: "What career claim or milestone does this signed proof validate?",
    guidance: "Signature-backed proof carries more weight when it comes from a named signer.",
    id: "signature-backed-documents",
    modalPhases: ["signature"],
    section: "identity",
    sourceHint: "Signer, legal representative, or certifying party",
    title: "Signature-backed documents",
  },
  {
    acceptedFormats: "Offer packet, signed offer, or PDF",
    completionTier: "document",
    contextHint: "Which role, employer, and date does this offer validate?",
    guidance: "Offer letters establish role, title, employer, and timing inside the employment record.",
    id: "offer-letters",
    modalPhases: ["document"],
    section: "employment",
    sourceHint: "Employer or recruiting team",
    title: "Offer letters",
  },
  {
    acceptedFormats: "Official PDF, HR portal export, or verified report",
    completionTier: "document",
    contextHint: "What part of the work history should this report confirm?",
    guidance: "Employment reports can validate tenure, employer relationships, and career chronology.",
    id: "employment-history-reports",
    modalPhases: ["document"],
    section: "employment",
    sourceHint: "Verifier, background provider, or employer system",
    title: "Employment history reports",
  },
  {
    acceptedFormats: "Promotion memo, signed letter, or HR record",
    completionTier: "document",
    contextHint: "What growth milestone or title shift does this document capture?",
    guidance: "Promotion letters help turn career growth into a verified advancement trail.",
    id: "promotion-letters",
    modalPhases: ["document"],
    section: "employment",
    sourceHint: "Manager, HR, or promotion committee",
    title: "Promotion letters",
  },
  {
    acceptedFormats: "Official PDF, signed statement, or branded letterhead",
    completionTier: "signature",
    contextHint: "Which role or employment fact does the company letter certify?",
    guidance: "Company letters add employer-backed proof for claims that matter in hiring review.",
    id: "company-letters",
    modalPhases: ["document", "signature"],
    section: "employment",
    sourceHint: "Company representative or official department",
    title: "Company letters",
  },
  {
    acceptedFormats: "Signed HR letter, employment confirmation, or PDF",
    completionTier: "signature",
    contextHint: "What employment status, title, or date range does this HR letter verify?",
    guidance: "HR-issued proof carries stronger trust when it explicitly confirms status or chronology.",
    id: "hr-official-letters",
    modalPhases: ["document", "signature"],
    section: "employment",
    sourceHint: "HR team, people ops, or employer official",
    title: "HR official letters",
  },
  {
    acceptedFormats: "Written referral, note, or signed PDF",
    completionTier: "relationship",
    contextHint: "What hiring signal or opportunity context does this referral provide?",
    guidance: "Referrals add social signal when they come from named professionals with relationship context.",
    id: "referrals",
    modalPhases: ["relationship"],
    section: "network",
    sourceHint: "Referrer name and company",
    title: "Referrals",
  },
  {
    acceptedFormats: "Endorsement letter, note, or signed statement",
    completionTier: "relationship",
    contextHint: "What capability or outcome does this endorsement reinforce?",
    guidance: "Endorsements work best when they point to concrete work, scope, and outcomes.",
    id: "endorsements",
    modalPhases: ["relationship"],
    section: "network",
    sourceHint: "Endorser name and role",
    title: "Endorsements",
  },
  {
    acceptedFormats: "Reference letter, signed note, or PDF",
    completionTier: "relationship",
    contextHint: "How did this colleague experience your work directly?",
    guidance: "Past colleague letters strengthen credibility when they describe overlap, trust, and execution.",
    id: "past-colleague-letters",
    modalPhases: ["relationship"],
    section: "network",
    sourceHint: "Colleague, team, and overlap context",
    title: "Past colleague letters",
  },
  {
    acceptedFormats: "Manager note, recommendation letter, or signed PDF",
    completionTier: "signature",
    contextHint: "What leadership signal, impact, or ownership does this letter verify?",
    guidance: "Hiring manager letters can carry real weight when they speak to decisions, trust, and performance.",
    id: "hiring-manager-letters",
    modalPhases: ["relationship", "signature"],
    section: "network",
    sourceHint: "Hiring manager name and organization",
    title: "Hiring manager letters",
  },
];

export const builderProfileFields = [
  "legalName",
  "careerHeadline",
  "targetRole",
  "location",
  "coreNarrative",
] as const;

export const builderPhaseTemplateIds = Object.fromEntries(
  phaseSequence.map((phase) => [
    phase,
    builderEvidenceTemplates
      .filter((template) => template.modalPhases.includes(phase))
      .map((template) => template.id),
  ]),
) as Record<CareerPhase, CareerEvidenceTemplateId[]>;

export const nextUploadPriority = [
  "idme-verification",
  "drivers-license",
  "signature-backed-documents",
  "offer-letters",
  "promotion-letters",
  "referrals",
  "endorsements",
  "company-letters",
  "hr-official-letters",
  "hiring-manager-letters",
  "employment-history-reports",
  "past-colleague-letters",
] as const satisfies readonly CareerEvidenceTemplateId[];

export const defaultUploadAccept =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*,.heic,.heif";
