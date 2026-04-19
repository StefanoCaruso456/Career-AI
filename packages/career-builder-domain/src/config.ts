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
  section: "education" | "employment" | "identity" | "network";
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
      "Add endorsements from people who can directly validate your work and outcomes.",
    previewLabel: "relationship-backed",
    rank: 2,
    supportTitle: "Trusted relationships",
  },
  document: {
    actionLabel: "Save document-backed evidence",
    description: "Attach offer, employment, and education proof that can be reviewed directly.",
    label: "Document-backed",
    modalTitle: "Document-backed evidence",
    modalSubtitle:
      "Use offer letters, employment verification, education, and transcripts to strengthen your profile.",
    previewLabel: "document-backed",
    rank: 3,
    supportTitle: "Structured proof",
  },
  signature: {
    actionLabel: "Save signature-backed evidence",
    description: "Add employment verification records backed by an official source.",
    label: "Signature-backed",
    modalTitle: "Signature-backed evidence",
    modalSubtitle:
      "Capture employer-backed verification that adds stronger confidence at review time.",
    previewLabel: "signature-backed",
    rank: 4,
    supportTitle: "Named signer trust",
  },
  institution: {
    actionLabel: "Save institution-verified evidence",
    description: "Anchor the Career ID to a government-issued identity verification.",
    label: "Institution-verified",
    modalTitle: "Institution-verified evidence",
    modalSubtitle:
      "Use government-issued identity proof to anchor the highest-trust layer.",
    previewLabel: "institution-verified",
    rank: 5,
    supportTitle: "Institution and issuer proof",
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
    acceptedFormats: "Images only",
    completionTier: "institution",
    contextHint: "What identity proof should this upload anchor?",
    guidance: "Government-issued ID helps bind your profile to a verified identity.",
    id: "drivers-license",
    modalPhases: ["institution"],
    section: "identity",
    sourceHint: "Issuing authority or state",
    title: "Driver's license",
    uploadKind: "drivers-license-images",
  },
  {
    acceptedFormats: "Offer packet, signed offer, or PDF",
    completionTier: "document",
    contextHint: "Which role, employer, and date does this offer validate?",
    guidance: "Offer letters establish role, title, employer, and timing for your employment history.",
    id: "offer-letters",
    modalPhases: ["document"],
    section: "employment",
    sourceHint: "Employer or recruiting team",
    title: "Offer letter",
  },
  {
    acceptedFormats: "Official PDF, HR portal export, or verified report",
    completionTier: "signature",
    contextHint: "What part of your work history should this employer verification confirm?",
    guidance: "Employment verification confirms tenure, title, and employer-backed chronology.",
    id: "employment-history-reports",
    modalPhases: ["document", "signature"],
    section: "employment",
    sourceHint: "Verifier, background provider, or employer system",
    title: "Employment verification",
  },
  {
    acceptedFormats: "Official diploma, degree PDF, or scanned copy",
    completionTier: "document",
    contextHint: "Which degree, program, or academic milestone does this prove?",
    guidance: "Education uploads give recruiters fast proof of formal academic completion.",
    id: "diplomas-degrees",
    modalPhases: ["document"],
    section: "education",
    sourceHint: "School, university, or registrar",
    title: "Education",
  },
  {
    acceptedFormats: "Official transcript, registrar PDF, or sealed scan",
    completionTier: "document",
    contextHint: "Which attendance window, coursework, or completion record does this transcript support?",
    guidance: "Transcripts add coursework and completion detail that backs up academic claims.",
    id: "transcripts",
    modalPhases: ["document"],
    section: "education",
    sourceHint: "Registrar, school portal, or academic office",
    title: "Transcripts",
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
    title: "Endorsement",
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
  "drivers-license",
  "offer-letters",
  "employment-history-reports",
  "diplomas-degrees",
  "transcripts",
  "endorsements",
] as const satisfies readonly CareerEvidenceTemplateId[];

export const defaultUploadAccept =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*,.heic,.heif";
