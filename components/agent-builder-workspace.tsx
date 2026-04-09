"use client";

import {
  Check,
  CheckCircle2,
  Upload,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  useDeferredValue,
  useState,
} from "react";
import styles from "./agent-builder-workspace.module.css";

type TierKey =
  | "self"
  | "relationship"
  | "document"
  | "signature"
  | "institution";

type EvidenceSectionId = "identity" | "employment" | "network";
type EvidenceFileSlot = "front" | "back";

type FileSummary = {
  name: string;
  sizeLabel: string;
  slot?: EvidenceFileSlot;
};

type EvidenceDraft = {
  context: string;
  files: FileSummary[];
  note: string;
  source: string;
  verifiedOn: string;
};

type ProfileDraft = {
  careerHeadline: string;
  coreNarrative: string;
  legalName: string;
  location: string;
  targetRole: string;
};

type EvidenceTemplate = {
  acceptedFormats: string;
  contextHint: string;
  guidance: string;
  id: string;
  section: EvidenceSectionId;
  sourceHint: string;
  tier: TierKey;
  title: string;
  uploadKind?: "default" | "drivers-license-images";
};

const driversLicenseImageSlots = [
  { key: "front", label: "Front of driver's license" },
  { key: "back", label: "Back of driver's license" },
] as const;

const tierMeta: Record<
  TierKey,
  {
    label: string;
    previewLabel: string;
    rank: number;
    toneClass: string;
  }
> = {
  self: {
    label: "Self-reported",
    previewLabel: "self-reported",
    rank: 1,
    toneClass: "tierSelf",
  },
  relationship: {
    label: "Relationship-backed",
    previewLabel: "relationship-backed",
    rank: 2,
    toneClass: "tierRelationship",
  },
  document: {
    label: "Document-backed",
    previewLabel: "document-backed",
    rank: 3,
    toneClass: "tierDocument",
  },
  signature: {
    label: "Signature-backed",
    previewLabel: "signature-backed",
    rank: 4,
    toneClass: "tierSignature",
  },
  institution: {
    label: "Institution-verified",
    previewLabel: "institution-verified",
    rank: 5,
    toneClass: "tierInstitution",
  },
};

const tierSequence = [
  "self",
  "relationship",
  "document",
  "signature",
  "institution",
] as const satisfies readonly TierKey[];

const evidenceTemplates: EvidenceTemplate[] = [
  {
    acceptedFormats: "Verification export, PDF, or screenshot",
    contextHint: "What part of identity or employment does this verification anchor?",
    guidance: "Use trusted identity verification to anchor the profile to a real person.",
    id: "idme-verification",
    section: "identity",
    sourceHint: "ID.me or linked verification provider",
    tier: "institution",
    title: "ID.me verification",
  },
  {
    acceptedFormats: "Images only",
    contextHint: "What should this ID unlock inside the credibility profile?",
    guidance: "Government-issued ID helps bind soul.md to an identity layer before broader sharing begins.",
    id: "drivers-license",
    section: "identity",
    sourceHint: "Issuing authority or state",
    tier: "institution",
    title: "Driver's license",
    uploadKind: "drivers-license-images",
  },
  {
    acceptedFormats: "Signed PDF, notarized file, or official agreement",
    contextHint: "What career claim or milestone does this signed proof validate?",
    guidance: "Signature-backed proof carries more weight when it comes from a named signer.",
    id: "signature-backed-documents",
    section: "identity",
    sourceHint: "Signer, legal representative, or certifying party",
    tier: "signature",
    title: "Signature-backed documents",
  },
  {
    acceptedFormats: "Offer packet, signed offer, or PDF",
    contextHint: "Which role, employer, and date does this offer validate?",
    guidance: "Offer letters establish role, title, employer, and timing inside the employment record.",
    id: "offer-letters",
    section: "employment",
    sourceHint: "Employer or recruiting team",
    tier: "document",
    title: "Offer letters",
  },
  {
    acceptedFormats: "Official PDF, HR portal export, or verified report",
    contextHint: "What part of the work history should this report confirm?",
    guidance: "Employment reports can validate tenure, employer relationships, and career chronology.",
    id: "employment-history-reports",
    section: "employment",
    sourceHint: "Verifier, background provider, or employer system",
    tier: "institution",
    title: "Employment history reports",
  },
  {
    acceptedFormats: "Promotion memo, signed letter, or HR record",
    contextHint: "What growth milestone or title shift does this document capture?",
    guidance: "Promotion letters help turn career growth into a verified advancement trail.",
    id: "promotion-letters",
    section: "employment",
    sourceHint: "Manager, HR, or promotion committee",
    tier: "document",
    title: "Promotion letters",
  },
  {
    acceptedFormats: "Official PDF, signed statement, or branded letterhead",
    contextHint: "Which role or employment fact does the company letter certify?",
    guidance: "Company letters add employer-backed proof for claims that matter in hiring review.",
    id: "company-letters",
    section: "employment",
    sourceHint: "Company representative or official department",
    tier: "signature",
    title: "Company letters",
  },
  {
    acceptedFormats: "Signed HR letter, employment confirmation, or PDF",
    contextHint: "What employment status, title, or date range does this HR letter verify?",
    guidance: "HR-issued proof carries stronger trust when it explicitly confirms status or chronology.",
    id: "hr-official-letters",
    section: "employment",
    sourceHint: "HR team, people ops, or employer official",
    tier: "signature",
    title: "HR official letters",
  },
  {
    acceptedFormats: "Written referral, note, or signed PDF",
    contextHint: "What hiring signal or opportunity context does this referral provide?",
    guidance: "Referrals add social signal when they come from named professionals with relationship context.",
    id: "referrals",
    section: "network",
    sourceHint: "Referrer name and company",
    tier: "relationship",
    title: "Referrals",
  },
  {
    acceptedFormats: "Endorsement letter, note, or signed statement",
    contextHint: "What capability or outcome does this endorsement reinforce?",
    guidance: "Endorsements work best when they point to concrete work, scope, and outcomes.",
    id: "endorsements",
    section: "network",
    sourceHint: "Endorser name and role",
    tier: "relationship",
    title: "Endorsements",
  },
  {
    acceptedFormats: "Reference letter, signed note, or PDF",
    contextHint: "How did this colleague experience your work directly?",
    guidance: "Past colleague letters strengthen credibility when they describe overlap, trust, and execution.",
    id: "past-colleague-letters",
    section: "network",
    sourceHint: "Colleague, team, and overlap context",
    tier: "relationship",
    title: "Past colleague letters",
  },
  {
    acceptedFormats: "Manager note, recommendation letter, or signed PDF",
    contextHint: "What leadership signal, impact, or ownership does this letter verify?",
    guidance: "Hiring manager letters can carry real weight when they speak to decisions, trust, and performance.",
    id: "hiring-manager-letters",
    section: "network",
    sourceHint: "Hiring manager name and organization",
    tier: "signature",
    title: "Hiring manager letters",
  },
];

const sectionMeta: Record<
  EvidenceSectionId,
  {
    copy: string;
    title: string;
  }
> = {
  identity: {
    copy: "Anchor the profile to identity and signature-level trust before broader sharing begins.",
    title: "Identity anchors",
  },
  employment: {
    copy: "Stack role evidence, promotion history, and official employer proof into one timeline.",
    title: "Employment evidence",
  },
  network: {
    copy: "Capture referrals and endorsements that show how trusted people describe your work.",
    title: "Referrals and endorsements",
  },
};

const growthCards = [
  {
    body: "New promotions, official letters, and verified exports should append to soul.md over time instead of replacing older proof.",
    title: "Append evidence continuously",
  },
  {
    body: "Relationship-backed proof is valuable early, but the strongest trust comes from document-backed and institution-verified uploads.",
    title: "Compound trust over time",
  },
  {
    body: "The same structured profile can later feed recruiter-safe views, agent workflows, and permissioned sharing without rewriting everything.",
    title: "Prepare for future flows",
  },
];

const emptyEvidence = Object.fromEntries(
  evidenceTemplates.map((template) => [
    template.id,
    {
      context: "",
      files: [],
      note: "",
      source: "",
      verifiedOn: "",
    },
  ]),
) as Record<string, EvidenceDraft>;

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isEvidenceStarted(draft: EvidenceDraft) {
  return Boolean(
    draft.files.length ||
      draft.source.trim() ||
      draft.context.trim() ||
      draft.note.trim() ||
      draft.verifiedOn.trim(),
  );
}

function isDriversLicenseImageTemplate(template: EvidenceTemplate) {
  return template.uploadKind === "drivers-license-images";
}

function getSlottedFile(draft: EvidenceDraft, slot: EvidenceFileSlot) {
  return draft.files.find((file) => file.slot === slot);
}

function getCompletedUploadCount(template: EvidenceTemplate, draft: EvidenceDraft) {
  if (!isDriversLicenseImageTemplate(template)) {
    return draft.files.length;
  }

  return driversLicenseImageSlots.filter(({ key }) => getSlottedFile(draft, key) !== undefined)
    .length;
}

function isEvidenceComplete(template: EvidenceTemplate, draft: EvidenceDraft) {
  if (isDriversLicenseImageTemplate(template)) {
    return getCompletedUploadCount(template, draft) === driversLicenseImageSlots.length;
  }

  return draft.files.length > 0;
}

function getCurrentTier(template: EvidenceTemplate, draft: EvidenceDraft): TierKey {
  if (isEvidenceComplete(template, draft)) {
    return template.tier;
  }

  return "self";
}

function buildSoulPreview(
  profile: ProfileDraft,
  evidence: Record<string, EvidenceDraft>,
  completedEvidenceCount: number,
  strongestTier: TierKey,
) {
  const sectionLines = (sectionId: EvidenceSectionId) => {
    const templates = evidenceTemplates.filter((template) => template.section === sectionId);
    const lines = templates
      .map((template) => {
        const draft = evidence[template.id];

        if (!isEvidenceStarted(draft)) {
          return null;
        }

        const tier = tierMeta[getCurrentTier(template, draft)];

        if (isDriversLicenseImageTemplate(template)) {
          const frontImage = getSlottedFile(draft, "front")?.name || "pending";
          const backImage = getSlottedFile(draft, "back")?.name || "pending";

          return [
            `- signal: ${template.title}`,
            `  tier: ${tier.previewLabel}`,
            "  capture_mode: required image pair",
            `  front_image: ${frontImage}`,
            `  back_image: ${backImage}`,
          ].join("\n");
        }

        const source = draft.source.trim() || "pending source";
        const context = draft.context.trim() || "context to be added";
        const files =
          draft.files.length > 0
            ? draft.files.map((file) => file.name).join(", ")
            : "pending upload";

        return [
          `- signal: ${template.title}`,
          `  tier: ${tier.previewLabel}`,
          `  source: ${source}`,
          `  context: ${context}`,
          `  verified_on: ${draft.verifiedOn || "pending"}`,
          `  files: ${files}`,
          draft.note.trim() ? `  note: ${draft.note.trim()}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .filter(Boolean);

    return lines.length > 0 ? lines.join("\n") : "- pending evidence";
  };

  return [
    "# soul.md",
    "",
    "## profile",
    `legal_name: ${profile.legalName || "pending"}`,
    `career_headline: ${profile.careerHeadline || "pending"}`,
    `target_role: ${profile.targetRole || "pending"}`,
    `location: ${profile.location || "pending"}`,
    `summary: ${profile.coreNarrative || "pending"}`,
    "",
    "## credibility_overview",
    `total_uploaded_signals: ${completedEvidenceCount}`,
    `strongest_tier: ${tierMeta[strongestTier].previewLabel}`,
    `profile_mode: living career credibility profile`,
    "",
    "## self_reported_foundation",
    "- type: self-reported",
    "  status: ready to strengthen with uploaded proof",
    "",
    "## identity",
    sectionLines("identity"),
    "",
    "## employment",
    sectionLines("employment"),
    "",
    "## network_signals",
    sectionLines("network"),
    "",
    "## growth_loop",
    "- append new evidence as career milestones happen",
    "- keep older proof visible for chronology and trust history",
    "- refresh recruiter-facing views from this source of truth",
  ].join("\n");
}

function SectionCount({
  complete,
  total,
}: {
  complete: number;
  total: number;
}) {
  return (
    <span className={styles.sectionCount}>
      {complete}/{total} ready
    </span>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className={styles.statCard}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function BuilderSection({
  children,
  count,
  copy,
  title,
}: {
  children: ReactNode;
  copy: string;
  count: ReactNode;
  title: string;
}) {
  return (
    <section className={styles.sectionPanel}>
      <div className={styles.sectionHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Structured intake</span>
          <h2 className={styles.sectionTitle}>{title}</h2>
          <p className={styles.sectionCopy}>{copy}</p>
        </div>
        {count}
      </div>
      {children}
    </section>
  );
}

function getPipelinePhaseSummary(
  tier: TierKey,
  {
    completed,
    started,
    total,
  }: {
    completed: number;
    started: number;
    total: number;
  },
  isComplete: boolean,
  isCurrent: boolean,
) {
  if (tier === "self") {
    return isComplete
      ? "Self-reported foundation complete. Your Career Agent ID can now level up with trusted proof."
      : `${completed}/${total} self-reported fields are ready.`;
  }

  if (isComplete) {
    return `${tierMeta[tier].label} trust is now live inside your Career Agent ID.`;
  }

  if (isCurrent) {
    if (started > 0) {
      return `${started}/${total} ${tierMeta[tier].previewLabel} signals are in progress.`;
    }

    switch (tier) {
      case "relationship":
        return "Add a referral, endorsement, or colleague note to unlock this phase.";
      case "document":
        return "Attach an official offer, promotion, or role document to unlock this phase.";
      case "signature":
        return "Add signed proof from HR, legal, or a hiring manager to unlock this phase.";
      case "institution":
        return "Add third-party verified proof to reach the highest trust layer.";
      default:
        return "This phase is ready for its first signal.";
    }
  }

  return "Waiting on the earlier trust layers to complete first.";
}

export function AgentBuilderWorkspace() {
  const [profile, setProfile] = useState<ProfileDraft>({
    careerHeadline: "",
    coreNarrative: "",
    legalName: "",
    location: "",
    targetRole: "",
  });
  const [evidence, setEvidence] = useState<Record<string, EvidenceDraft>>(emptyEvidence);

  const deferredProfile = useDeferredValue(profile);
  const deferredEvidence = useDeferredValue(evidence);

  const profileFields = [
    profile.legalName,
    profile.careerHeadline,
    profile.targetRole,
    profile.location,
    profile.coreNarrative,
  ];
  const completedProfileFields = profileFields.filter((field) => field.trim().length > 0).length;
  const identityTemplates = evidenceTemplates.filter((template) => template.section === "identity");
  const employmentTemplates = evidenceTemplates.filter(
    (template) => template.section === "employment",
  );
  const networkTemplates = evidenceTemplates.filter((template) => template.section === "network");
  const completedIdentitySignals = identityTemplates.filter(
    (template) => isEvidenceComplete(template, evidence[template.id]),
  ).length;
  const completedEmploymentSignals = employmentTemplates.filter(
    (template) => isEvidenceComplete(template, evidence[template.id]),
  ).length;
  const completedNetworkSignals = networkTemplates.filter(
    (template) => isEvidenceComplete(template, evidence[template.id]),
  ).length;
  const completedEvidenceCount =
    completedIdentitySignals + completedEmploymentSignals + completedNetworkSignals;
  const totalTasks = profileFields.length + evidenceTemplates.length;
  const overallProgress = Math.round(
    ((completedProfileFields + completedEvidenceCount) / totalTasks) * 100,
  );
  const completedProfileReady = completedProfileFields === profileFields.length;
  const strongestTier = evidenceTemplates.reduce<TierKey>((currentStrongest, template) => {
    const tier = getCurrentTier(template, evidence[template.id]);

    return tierMeta[tier].rank > tierMeta[currentStrongest].rank ? tier : currentStrongest;
  }, "self");
  const strongestTierRank = completedProfileReady ? tierMeta[strongestTier].rank : 0;
  const activeTierRank = completedProfileReady
    ? Math.min(strongestTierRank + 1, tierSequence.length)
    : tierMeta.self.rank;
  const tierStats = Object.fromEntries(
    tierSequence.map((tier) => {
      if (tier === "self") {
        return [
          tier,
          {
            completed: completedProfileFields,
            started: completedProfileFields,
            total: profileFields.length,
          },
        ];
      }

      const templates = evidenceTemplates.filter((template) => template.tier === tier);

      return [
        tier,
        {
          completed: templates.filter((template) =>
            isEvidenceComplete(template, evidence[template.id]),
          ).length,
          started: templates.filter((template) => isEvidenceStarted(evidence[template.id])).length,
          total: templates.length,
        },
      ];
    }),
  ) as Record<
    TierKey,
    {
      completed: number;
      started: number;
      total: number;
    }
  >;
  const pipelinePhases = tierSequence.map((tier) => {
    const rank = tierMeta[tier].rank;
    const isComplete =
      tier === "self"
        ? completedProfileReady
        : completedProfileReady && strongestTierRank >= rank;
    const isCurrent = !isComplete && rank === activeTierRank;
    const stateClass = isComplete
      ? styles.pipelineStepComplete
      : isCurrent
        ? styles.pipelineStepCurrent
        : styles.pipelineStepPending;

    return {
      connectorComplete: isComplete,
      isComplete,
      key: tier,
      label: tierMeta[tier].label,
      stateClass,
      summary: getPipelinePhaseSummary(
        tier,
        tierStats[tier],
        isComplete,
        isCurrent,
      ),
    };
  });
  const queuedTemplates = evidenceTemplates.filter(
    (template) => !isEvidenceComplete(template, evidence[template.id]),
  );
  const deferredPreview = buildSoulPreview(
    deferredProfile,
    deferredEvidence,
    completedEvidenceCount,
    strongestTier,
  );

  function handleProfileChange(field: keyof ProfileDraft) {
    return (
      event: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>,
    ) => {
      const { value } = event.target;

      setProfile((currentProfile) => ({
        ...currentProfile,
        [field]: value,
      }));
    };
  }

  function handleEvidenceChange(
    evidenceId: string,
    field: keyof Omit<EvidenceDraft, "files">,
  ) {
    return (
      event: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLTextAreaElement>,
    ) => {
      const { value } = event.target;

      setEvidence((currentEvidence) => ({
        ...currentEvidence,
        [evidenceId]: {
          ...currentEvidence[evidenceId],
          [field]: value,
        },
      }));
    };
  }

  function handleFileChange(evidenceId: string) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const nextFiles = Array.from(event.target.files ?? []).map((file) => ({
        name: file.name,
        sizeLabel: formatBytes(file.size),
      }));

      if (nextFiles.length === 0) {
        return;
      }

      setEvidence((currentEvidence) => {
        const existingFiles = currentEvidence[evidenceId].files;
        const mergedFiles = [...existingFiles];

        nextFiles.forEach((file) => {
          const alreadyAdded = mergedFiles.some(
            (existingFile) =>
              existingFile.name === file.name &&
              existingFile.sizeLabel === file.sizeLabel,
          );

          if (!alreadyAdded) {
            mergedFiles.push(file);
          }
        });

        return {
          ...currentEvidence,
          [evidenceId]: {
            ...currentEvidence[evidenceId],
            files: mergedFiles,
          },
        };
      });

      event.target.value = "";
    };
  }

  function handleSlottedFileChange(evidenceId: string, slot: EvidenceFileSlot) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const nextFile = Array.from(event.target.files ?? []).find((file) =>
        file.type.startsWith("image/"),
      );

      if (!nextFile) {
        event.target.value = "";
        return;
      }

      setEvidence((currentEvidence) => {
        const remainingFiles = currentEvidence[evidenceId].files.filter(
          (file) => file.slot !== slot,
        );
        const updatedFiles = [
          ...remainingFiles,
          {
            name: nextFile.name,
            sizeLabel: formatBytes(nextFile.size),
            slot,
          },
        ];
        const orderedFiles = driversLicenseImageSlots.flatMap(({ key }) => {
          const file = updatedFiles.find((candidate) => candidate.slot === key);
          return file ? [file] : [];
        });

        return {
          ...currentEvidence,
          [evidenceId]: {
            ...currentEvidence[evidenceId],
            files: orderedFiles,
          },
        };
      });

      event.target.value = "";
    };
  }

  function removeFile(evidenceId: string, fileName: string) {
    setEvidence((currentEvidence) => ({
      ...currentEvidence,
      [evidenceId]: {
        ...currentEvidence[evidenceId],
        files: currentEvidence[evidenceId].files.filter((file) => file.name !== fileName),
      },
    }));
  }

  function removeSlottedFile(evidenceId: string, slot: EvidenceFileSlot) {
    setEvidence((currentEvidence) => ({
      ...currentEvidence,
      [evidenceId]: {
        ...currentEvidence[evidenceId],
        files: currentEvidence[evidenceId].files.filter((file) => file.slot !== slot),
      },
    }));
  }

  function renderEvidenceCards(sectionId: EvidenceSectionId) {
    return evidenceTemplates
      .filter((template) => template.section === sectionId)
      .map((template) => {
        const draft = evidence[template.id];
        const currentTier = tierMeta[getCurrentTier(template, draft)];
        const uploadCount = getCompletedUploadCount(template, draft);
        const stateLabel = isDriversLicenseImageTemplate(template)
          ? uploadCount === driversLicenseImageSlots.length
            ? "Front and back attached"
            : uploadCount > 0
              ? `${uploadCount} of ${driversLicenseImageSlots.length} images attached`
              : ""
          : draft.files.length > 0
            ? `${draft.files.length} upload${draft.files.length === 1 ? "" : "s"} attached`
            : isEvidenceStarted(draft)
              ? "Draft started"
              : "Not started";

        return (
          <article className={styles.evidenceCard} key={template.id}>
            <div className={styles.evidenceCardHeader}>
              <div>
                <h3 className={styles.evidenceTitle}>{template.title}</h3>
                <p className={styles.evidenceGuidance}>{template.guidance}</p>
              </div>
              <div className={styles.tierGroup}>
                <span className={[styles.tierBadge, styles[currentTier.toneClass]].join(" ")}>
                  {currentTier.label}
                </span>
              </div>
            </div>

            <div className={styles.evidenceMetaRow}>
              {stateLabel ? <span className={styles.statusBadge}>{stateLabel}</span> : null}
              {template.acceptedFormats ? (
                <span className={styles.formatHint}>{template.acceptedFormats}</span>
              ) : null}
            </div>

            {isDriversLicenseImageTemplate(template) ? (
              <div className={styles.uploadSlotGrid}>
                {driversLicenseImageSlots.map(({ key, label }) => {
                  const file = getSlottedFile(draft, key);

                  return (
                    <div className={styles.uploadSlot} key={`${template.id}-${key}`}>
                      <span className={styles.fieldLabel}>{label}</span>
                      <label className={styles.uploadZone} htmlFor={`upload-${template.id}-${key}`}>
                        <input
                          accept="image/*"
                          className={styles.fileInput}
                          id={`upload-${template.id}-${key}`}
                          onChange={handleSlottedFileChange(template.id, key)}
                          type="file"
                        />
                        <Upload aria-hidden="true" size={18} strokeWidth={2} />
                        <div>
                          <strong>{file ? "Replace image" : `Upload ${label.toLowerCase()}`}</strong>
                          <span>Image only</span>
                        </div>
                      </label>

                      {file ? (
                        <div className={styles.fileChipRow}>
                          <div className={styles.fileChip}>
                            <div>
                              <strong>{file.name}</strong>
                              <small>{file.sizeLabel}</small>
                            </div>
                            <button
                              className={styles.fileChipRemove}
                              onClick={() => removeSlottedFile(template.id, key)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className={styles.uploadSlotHint}>Required image slot.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Source / issuer</span>
                    <input
                      className={styles.input}
                      onChange={handleEvidenceChange(template.id, "source")}
                      placeholder={template.sourceHint}
                      type="text"
                      value={draft.source}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Verified or issued on</span>
                    <input
                      className={styles.input}
                      onChange={handleEvidenceChange(template.id, "verifiedOn")}
                      type="date"
                      value={draft.verifiedOn}
                    />
                  </label>

                  <label className={[styles.field, styles.fieldFull].join(" ")}>
                    <span className={styles.fieldLabel}>Validation context</span>
                    <textarea
                      className={styles.textarea}
                      onChange={handleEvidenceChange(template.id, "context")}
                      placeholder={template.contextHint}
                      rows={3}
                      value={draft.context}
                    />
                  </label>

                  <label className={[styles.field, styles.fieldFull].join(" ")}>
                    <span className={styles.fieldLabel}>Why this should matter in soul.md</span>
                    <textarea
                      className={styles.textarea}
                      onChange={handleEvidenceChange(template.id, "note")}
                      placeholder="Add the signal, overlap, or milestone this evidence should reinforce."
                      rows={2}
                      value={draft.note}
                    />
                  </label>
                </div>

                <label className={styles.uploadZone} htmlFor={`upload-${template.id}`}>
                  <input
                    className={styles.fileInput}
                    id={`upload-${template.id}`}
                    multiple
                    onChange={handleFileChange(template.id)}
                    type="file"
                  />
                  <Upload aria-hidden="true" size={18} strokeWidth={2} />
                  <div>
                    <strong>Upload supporting evidence</strong>
                    <span>{template.acceptedFormats}</span>
                  </div>
                </label>

                {draft.files.length > 0 ? (
                  <div className={styles.fileChipRow}>
                    {draft.files.map((file) => (
                      <div className={styles.fileChip} key={`${template.id}-${file.name}`}>
                        <div>
                          <strong>{file.name}</strong>
                          <small>{file.sizeLabel}</small>
                        </div>
                        <button
                          className={styles.fileChipRemove}
                          onClick={() => removeFile(template.id, file.name)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </article>
        );
      });
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>Build and grow your Career ID</h1>
            <p className={styles.heroBody}>
              Create the living credibility profile behind your verified career identity.
              Start with self-reported context, attach trusted evidence, and keep appending
              new signals over time as your career grows.
            </p>

            <div className={styles.statGrid}>
              <StatCard label="overall builder progress" value={`${overallProgress}%`} />
              <StatCard
                label="uploaded evidence signals"
                value={String(completedEvidenceCount).padStart(2, "0")}
              />
              <StatCard label="strongest trust tier" value={tierMeta[strongestTier].label} />
            </div>
          </div>

          <aside className={styles.progressRail}>
            <div className={styles.progressRailHeader}>
              <span className={styles.sectionEyebrow}>Agent ID pipeline</span>
              <h2>Credible agent ID creation status</h2>
              <p className={styles.progressRailCopy}>
                Each trust phase lights up as the profile moves from self-reported context
                into stronger verification.
              </p>
            </div>

            <div className={styles.pipelineSteps}>
              {pipelinePhases.map((phase, index) => (
                <article className={[styles.pipelineStep, phase.stateClass].join(" ")} key={phase.key}>
                  <div className={styles.pipelineTrack}>
                    <span className={styles.pipelineMarker}>
                      {phase.isComplete ? (
                        <Check aria-hidden="true" size={16} strokeWidth={2.6} />
                      ) : (
                        <span aria-hidden="true" className={styles.pipelineMarkerCore} />
                      )}
                    </span>
                    {index < pipelinePhases.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className={[
                          styles.pipelineConnector,
                          phase.connectorComplete ? styles.pipelineConnectorComplete : "",
                        ].join(" ")}
                      />
                    ) : null}
                  </div>

                  <div className={styles.pipelineContent}>
                    <span className={styles.pipelinePill}>{phase.label}</span>
                    <p className={styles.pipelineSummary}>{phase.summary}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.nextActionPanel}>
              <span className={styles.sectionEyebrow}>Next best uploads</span>
              <ul>
                {queuedTemplates.slice(0, 3).map((template) => (
                  <li key={template.id}>{template.title}</li>
                ))}
              </ul>
            </div>
          </aside>
        </section>

        <section className={styles.workspace}>
          <div className={styles.mainColumn}>
            <BuilderSection
              copy="Separate the user-entered profile foundation from the documents and letters that will raise trust over time."
              count={<SectionCount complete={completedProfileFields} total={profileFields.length} />}
              title="Self-reported foundation"
            >
              <div className={styles.foundationPanel}>
                <div className={styles.foundationHeader}>
                  <span className={styles.sectionHint}>
                    This section establishes the profile narrative before evidence is attached.
                  </span>
                </div>

                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Legal name</span>
                    <input
                      className={styles.input}
                      onChange={handleProfileChange("legalName")}
                      placeholder="Taylor Morgan"
                      type="text"
                      value={profile.legalName}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Career headline</span>
                    <input
                      className={styles.input}
                      onChange={handleProfileChange("careerHeadline")}
                      placeholder="Operator who turns ambiguous hiring ops into repeatable systems"
                      type="text"
                      value={profile.careerHeadline}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Target role</span>
                    <input
                      className={styles.input}
                      onChange={handleProfileChange("targetRole")}
                      placeholder="Founding recruiter, People Ops lead, or GTM operator"
                      type="text"
                      value={profile.targetRole}
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Location</span>
                    <input
                      className={styles.input}
                      onChange={handleProfileChange("location")}
                      placeholder="Chicago, IL"
                      type="text"
                      value={profile.location}
                    />
                  </label>

                  <label className={[styles.field, styles.fieldFull].join(" ")}>
                    <span className={styles.fieldLabel}>Core narrative</span>
                    <textarea
                      className={styles.textarea}
                      onChange={handleProfileChange("coreNarrative")}
                      placeholder="Summarize the kind of trust, outcomes, and career evidence this profile should prove over time."
                      rows={4}
                      value={profile.coreNarrative}
                    />
                  </label>
                </div>
              </div>
            </BuilderSection>

            <BuilderSection
              copy={sectionMeta.identity.copy}
              count={
                <SectionCount
                  complete={completedIdentitySignals}
                  total={identityTemplates.length}
                />
              }
              title={sectionMeta.identity.title}
            >
              <div className={styles.evidenceGrid}>{renderEvidenceCards("identity")}</div>
            </BuilderSection>

            <BuilderSection
              copy={sectionMeta.employment.copy}
              count={
                <SectionCount
                  complete={completedEmploymentSignals}
                  total={employmentTemplates.length}
                />
              }
              title={sectionMeta.employment.title}
            >
              <div className={styles.evidenceGrid}>{renderEvidenceCards("employment")}</div>
            </BuilderSection>

            <BuilderSection
              copy={sectionMeta.network.copy}
              count={
                <SectionCount
                  complete={completedNetworkSignals}
                  total={networkTemplates.length}
                />
              }
              title={sectionMeta.network.title}
            >
              <div className={styles.evidenceGrid}>{renderEvidenceCards("network")}</div>
            </BuilderSection>

            <BuilderSection
              copy="This workspace should keep improving as new proof arrives, so the profile can grow from onboarding into long-term credibility maintenance."
              count={<span className={styles.sectionCount}>living profile</span>}
              title="Growth cadence"
            >
              <div className={styles.growthGrid}>
                {growthCards.map((card) => (
                  <article className={styles.growthCard} key={card.title}>
                    <div className={styles.growthIcon}>
                      <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
                    </div>
                    <strong>{card.title}</strong>
                    <p>{card.body}</p>
                  </article>
                ))}
              </div>
            </BuilderSection>
          </div>

          <aside className={styles.previewPanel}>
            <div className={styles.legendGrid}>
              {(["self", "relationship", "document", "signature", "institution"] as TierKey[]).map(
                (tier) => (
                  <article className={styles.legendCard} key={tier}>
                    <span className={[styles.tierBadge, styles[tierMeta[tier].toneClass]].join(" ")}>
                      {tierMeta[tier].label}
                    </span>
                  </article>
                ),
              )}
            </div>

            <div className={styles.previewSummary}>
              <article>
                <strong>{completedEvidenceCount}</strong>
                <span>evidence-backed signals attached</span>
              </article>
              <article>
                <strong>{queuedTemplates.length}</strong>
                <span>signals still waiting for proof</span>
              </article>
            </div>

            <pre className={styles.previewCode}>{deferredPreview}</pre>
          </aside>
        </section>
      </div>
    </main>
  );
}
