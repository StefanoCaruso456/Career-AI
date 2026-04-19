"use client";

import {
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  startTransition,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  builderEvidenceTemplates,
  builderPhaseTemplateIds,
  defaultUploadAccept,
  driversLicenseImageSlots,
  phaseMeta,
  type BuilderEvidenceTemplate,
} from "@/packages/career-builder-domain/src/config";
import type {
  CareerArtifactReference,
  CareerBuilderSnapshotDto,
  CareerEvidenceRecord,
  CareerEvidenceTemplateId,
  CareerIdVerificationStatus,
  CareerPhase,
  CareerProfileInput,
  EvidenceFileSlot,
} from "@/packages/contracts/src";
import type { ClaimVerificationEntry } from "@/lib/api-gateway/types";
import styles from "./agent-builder-workspace.module.css";

const DOC_TYPE_LABEL: Record<string, string> = {
  "offer-letters": "offer letter",
  "employment-history-reports": "HR letter",
  "diplomas-degrees": "diploma",
  transcripts: "transcript",
};

function formatSaveMessage(
  verifications: ClaimVerificationEntry[] | undefined,
): { text: string; kind: "success" | "error" } {
  if (!verifications || verifications.length === 0) {
    return { text: "Saved to your Career ID.", kind: "success" };
  }

  // Single-upload case: surface the verdict inline.
  if (verifications.length === 1) {
    const { outcome, filename, templateId } = verifications[0];
    const docLabel = DOC_TYPE_LABEL[templateId] ?? "document";
    if (!outcome.ok) {
      if (outcome.reason === "UNCONFIGURED") {
        return {
          text: "Saved. Verification skipped — verifier not configured.",
          kind: "success",
        };
      }
      return {
        text: `Verification unavailable (${outcome.reason.toLowerCase().replace(/_/g, " ")}).`,
        kind: "error",
      };
    }
    const { status, displayStatus, matches } = outcome.result;
    const summaryParts = [
      matches.isExpectedDocumentType ?? matches.isOfferLetter
        ? `${docLabel} ✓`
        : `${docLabel} ✗`,
      matches.employer ? "employer ✓" : "employer ✗",
      matches.dates ? "dates ✓" : "dates ✗",
      matches.role ? "role ✓" : "role ✗",
    ];
    if (typeof matches.recipient === "boolean") {
      summaryParts.push(matches.recipient ? "recipient ✓" : "recipient ✗");
    }
    const matchSummary = summaryParts.join(" · ");
    if (status === "VERIFIED" || status === "PARTIAL") {
      return { text: `Saved. ${displayStatus}. ${matchSummary}`, kind: "success" };
    }
    // FAILED — drop the "Saved." prefix so the user doesn't read this as a pass.
    const reason = outcome.result.failureReason;
    const reasonSuffix = reason ? ` ${reason}` : "";
    return {
      text: `${displayStatus}.${reasonSuffix} ${matchSummary} (file: ${filename})`,
      kind: "error",
    };
  }

  // Multiple uploads — summarize counts across all claim types.
  const verifiedCount = verifications.filter(
    (v) => v.outcome.ok && v.outcome.result.status === "VERIFIED",
  ).length;
  const failedCount = verifications.filter(
    (v) => v.outcome.ok && v.outcome.result.status === "FAILED",
  ).length;
  const kind: "success" | "error" = failedCount > 0 ? "error" : "success";
  const prefix = failedCount > 0 ? "" : "Saved. ";
  return {
    text: `${prefix}${verifiedCount}/${verifications.length} document(s) verified${
      failedCount > 0 ? `, ${failedCount} failed` : ""
    }.`,
    kind,
  };
}

type AgentBuilderWorkspaceProps = {
  initialSnapshot: CareerBuilderSnapshotDto;
};

type DraftFile = CareerArtifactReference & {
  file?: File;
  isNew: boolean;
  key: string;
};

type EvidenceDraftState = {
  files: DraftFile[];
  issuedOn: string;
  sourceOrIssuer: string;
  role: string;
  templateId: CareerEvidenceTemplateId;
  validationContext: string;
  whyItMatters: string;
  verificationStatus: "VERIFIED" | "PARTIAL" | "FAILED" | null;
};

type ModalDraftState = {
  evidence: Record<string, EvidenceDraftState>;
  profile: CareerProfileInput;
};

type FieldErrors = Record<string, Record<string, string>>;
type GovernmentVerificationModalStep = "intro" | "consent" | "processing" | "result";

type GovernmentVerificationRequestError = Error & {
  errorCode?: string | null;
  statusCode?: number;
};

const GOVERNMENT_VERIFICATION_POLL_INTERVAL_MS = 4000;
const GOVERNMENT_VERIFICATION_MAX_AUTO_POLLS = 20;

const profileFieldConfig = [
  {
    field: "legalName",
    label: "Legal name",
    placeholder: "Taylor Morgan",
  },
  {
    field: "careerHeadline",
    label: "Career headline",
    placeholder: "Operator who turns ambiguous hiring ops into repeatable systems",
  },
  {
    field: "targetRole",
    label: "Target role",
    placeholder: "Founding recruiter, People Ops lead, or GTM operator",
  },
  {
    field: "location",
    label: "Location",
    placeholder: "Chicago, IL",
  },
  {
    field: "coreNarrative",
    label: "Core narrative",
    placeholder:
      "Summarize the kind of trust, outcomes, and career evidence this profile should prove over time.",
    rows: 5,
  },
] as const satisfies ReadonlyArray<{
  field: keyof CareerProfileInput;
  label: string;
  placeholder: string;
  rows?: number;
}>;

const sectionOrder = ["identity", "employment", "education", "network"] as const;

const sectionMeta: Record<
  (typeof sectionOrder)[number],
  {
    copy: string;
    title: string;
  }
> = {
  identity: {
    copy: "Identity anchors and signer-backed proof that bind the profile to a real person or certifying party.",
    title: "Identity anchors",
  },
  employment: {
    copy: "Role, chronology, and employer-backed evidence that strengthens the career timeline.",
    title: "Employment evidence",
  },
  education: {
    copy: "Academic proof that strengthens the credibility layer behind the Career ID.",
    title: "Education evidence",
  },
  network: {
    copy: "Relationship signals that show how trusted people validate your outcomes.",
    title: "Endorsements",
  },
};

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isDriverLicenseTemplate(template: BuilderEvidenceTemplate) {
  return template.uploadKind === "drivers-license-images";
}

function phaseToTrustLayer(phase: CareerPhase) {
  switch (phase) {
    case "self":
      return "self_reported";
    case "relationship":
      return "relationship_backed";
    case "document":
      return "document_backed";
    case "signature":
      return "signature_backed";
    case "institution":
      return "institution_verified";
  }
}

function toProfileInput(snapshot: CareerBuilderSnapshotDto["profile"]): CareerProfileInput {
  return {
    legalName: snapshot.legalName,
    careerHeadline: snapshot.careerHeadline,
    targetRole: snapshot.targetRole,
    location: snapshot.location,
    coreNarrative: snapshot.coreNarrative,
  };
}

function toDraftFile(file: CareerArtifactReference): DraftFile {
  return {
    ...file,
    isNew: false,
    key: file.artifactId,
  };
}

function createEvidenceDraft(record: CareerEvidenceRecord): EvidenceDraftState {
  return {
    templateId: record.templateId,
    sourceOrIssuer: record.sourceOrIssuer,
    role: record.role ?? "",
    issuedOn: record.issuedOn,
    validationContext: record.validationContext,
    whyItMatters: record.whyItMatters,
    files: record.files.map(toDraftFile),
    verificationStatus: record.verificationStatus ?? null,
  };
}

function buildPhaseDraft(
  snapshot: CareerBuilderSnapshotDto,
  phase: CareerPhase,
): ModalDraftState {
  const relevantTemplateIds = new Set(builderPhaseTemplateIds[phase]);

  return {
    profile: toProfileInput(snapshot.profile),
    evidence: Object.fromEntries(
      snapshot.evidence
        .filter((record) => relevantTemplateIds.has(record.templateId))
        .map((record) => [record.templateId, createEvidenceDraft(record)]),
    ),
  };
}

function getCompletedUploadCount(
  template: BuilderEvidenceTemplate,
  draft: EvidenceDraftState,
) {
  if (!isDriverLicenseTemplate(template)) {
    return draft.files.length;
  }

  return driversLicenseImageSlots.filter(({ key }) =>
    draft.files.some((file) => file.slot === key),
  ).length;
}

function getEvidenceStateLabel(
  template: BuilderEvidenceTemplate,
  draft: EvidenceDraftState,
) {
  const uploadCount = getCompletedUploadCount(template, draft);

  // Tiered offer-letter verdicts on the card's status pill. Mirrors the
  // Persona "Government ID verified" pattern but with two tiers because the
  // verifier produces a real trust gradient:
  //   VERIFIED  → signed + sender signal matches claim (has CoC + domain match)
  //   PARTIAL   → signed but can't verify sender (most DocuSign PDFs without
  //               a Certificate of Completion page — the common real case)
  //   FAILED    → fall through to the generic upload-count label; save banner
  //               already shows the failure detail inline
  if (template.id === "offer-letters") {
    if (draft.verificationStatus === "VERIFIED") {
      return "Offer letter verified";
    }
    if (draft.verificationStatus === "PARTIAL") {
      return "Offer letter on file";
    }
  }

  if (isDriverLicenseTemplate(template)) {
    if (uploadCount === driversLicenseImageSlots.length) {
      return "Front and back attached";
    }

    if (uploadCount > 0) {
      return `${uploadCount} of ${driversLicenseImageSlots.length} images attached`;
    }

    return "Not started";
  }

  if (draft.files.length > 0) {
    return `${draft.files.length} upload${draft.files.length === 1 ? "" : "s"} attached`;
  }

  if (
    draft.sourceOrIssuer.trim() ||
    draft.issuedOn.trim() ||
    draft.validationContext.trim() ||
    draft.whyItMatters.trim()
  ) {
    return "Draft started";
  }

  return "Not started";
}

/**
 * Returns which visual variant the card's status pill should use. Mirrors
 * getEvidenceStateLabel's offer-letter branches exactly — when the label
 * says "Offer letter verified", the pill is green; when it says "Signed
 * offer letter on file" (PARTIAL), amber; everything else uses the base
 * neutral styling.
 */
function getEvidenceStatePillVariant(
  template: BuilderEvidenceTemplate,
  draft: EvidenceDraftState,
): "default" | "verified" | "partial" {
  if (template.id === "offer-letters") {
    if (draft.verificationStatus === "VERIFIED") return "verified";
    if (draft.verificationStatus === "PARTIAL") return "partial";
  }
  return "default";
}

function serializePhaseDraft(phase: CareerPhase, draft: ModalDraftState) {
  return JSON.stringify({
    phase,
    profile: draft.profile,
    evidence: Object.fromEntries(
      Object.entries(draft.evidence).map(([templateId, value]) => [
        templateId,
        {
          ...value,
          files: value.files.map((file) => ({
            artifactId: file.artifactId,
            key: file.key,
            name: file.name,
            slot: file.slot,
          })),
        },
      ]),
    ),
  });
}

function isValidDate(value: string) {
  return value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validatePhaseDraft(phase: CareerPhase, draft: ModalDraftState): FieldErrors {
  const errors: FieldErrors = {};

  if (phase === "self") {
    const hasAnyProfileValue = Object.values(draft.profile).some((value) => value.trim().length > 0);

    if (hasAnyProfileValue && draft.profile.legalName.trim().length === 0) {
      errors.profile = {
        legalName: "Legal name is required once you start the self-reported foundation.",
      };
    }

    return errors;
  }

  for (const templateId of builderPhaseTemplateIds[phase]) {
    const draftValue = draft.evidence[templateId];
    const template = builderEvidenceTemplates.find((candidate) => candidate.id === templateId);

    if (!draftValue || !template) {
      continue;
    }

    const nextErrors: Record<string, string> = {};
    const hasFiles = draftValue.files.length > 0;

    if (hasFiles && !isDriverLicenseTemplate(template) && draftValue.sourceOrIssuer.trim().length === 0) {
      nextErrors.sourceOrIssuer = "Source / issuer is required once proof is attached.";
    }

    if (hasFiles && !isDriverLicenseTemplate(template) && draftValue.issuedOn.trim().length === 0) {
      nextErrors.issuedOn = "Verified or issued date is required once proof is attached.";
    }

    if (!isValidDate(draftValue.issuedOn)) {
      nextErrors.issuedOn = "Enter a valid date.";
    }

    if (templateId === "offer-letters" && draftValue.role.trim().length === 0) {
      nextErrors.role = "Role is required for offer letters.";
    }

    if (isDriverLicenseTemplate(template)) {
      const invalidImage = draftValue.files.find(
        (file) => file.file && !file.file.type.startsWith("image/"),
      );

      if (invalidImage) {
        nextErrors.files = "Driver's license uploads must be image files.";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      errors[templateId] = nextErrors;
    }
  }

  return errors;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

function PhaseCount({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  return (
    <span className={styles.phaseCount}>
      {completed}/{total} ready
    </span>
  );
}

function getDocumentStatusTagLabel(status: CareerIdVerificationStatus) {
  switch (status) {
    case "locked":
      return "Locked";
    case "in_progress":
      return "In review";
    case "manual_review":
      return "Manual review";
    case "retry_needed":
      return "Retry needed";
    case "failed":
      return "Not completed";
    case "verified":
      return "Government ID verified";
    case "not_started":
    default:
      return "Start here";
  }
}

function getDocumentHeroTitle(status: CareerIdVerificationStatus) {
  switch (status) {
    case "locked":
      return "Government ID verification";
    case "in_progress":
      return "Identity verification in review";
    case "manual_review":
      return "Verification under review";
    case "retry_needed":
      return "Let's retry your identity check";
    case "failed":
      return "Verification not completed";
    case "verified":
      return "Government ID verified";
    case "not_started":
    default:
      return "Verify your identity first";
  }
}

function getDocumentHeroEyebrow(status: CareerIdVerificationStatus) {
  switch (status) {
    case "verified":
      return "Verified trust artifact";
    case "in_progress":
    case "manual_review":
      return "Active verification";
    case "retry_needed":
    case "failed":
      return "Recovery needed";
    case "locked":
      return "Locked trust step";
    case "not_started":
    default:
      return "First trust step";
  }
}

function getDocumentHeroIcon(status: CareerIdVerificationStatus) {
  switch (status) {
    case "locked":
      return <LockKeyhole aria-hidden="true" size={18} strokeWidth={2.1} />;
    case "in_progress":
      return <LoaderCircle aria-hidden="true" className={styles.spinningIcon} size={18} strokeWidth={2.1} />;
    case "manual_review":
      return <AlertCircle aria-hidden="true" size={18} strokeWidth={2.1} />;
    case "retry_needed":
    case "failed":
      return <AlertCircle aria-hidden="true" size={18} strokeWidth={2.1} />;
    case "verified":
      return <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2.1} />;
    case "not_started":
    default:
      return <ShieldCheck aria-hidden="true" size={18} strokeWidth={2.1} />;
  }
}

function EvidenceGroup({
  children,
  className,
  copy,
  label,
}: {
  children: ReactNode;
  className?: string;
  copy?: string;
  label: string;
}) {
  return (
    <section className={className ? `${styles.evidenceGroup} ${className}` : styles.evidenceGroup}>
      <div className={styles.evidenceGroupHeader}>
        <span className={styles.evidenceGroupEyebrow}>{label}</span>
        {copy ? <p className={styles.evidenceGroupCopy}>{copy}</p> : null}
      </div>

      {children}
    </section>
  );
}

function EvidenceCard({
  draft,
  errors,
  onChange,
  onDefaultFiles,
  onDriverLicenseFile,
  onRemoveFile,
  template,
}: {
  draft: EvidenceDraftState;
  errors?: Record<string, string>;
  onChange: (
    templateId: CareerEvidenceTemplateId,
    field: keyof Omit<EvidenceDraftState, "files" | "templateId">,
    value: string,
  ) => void;
  onDefaultFiles: (templateId: CareerEvidenceTemplateId, files: FileList | null) => void;
  onDriverLicenseFile: (
    templateId: CareerEvidenceTemplateId,
    slot: EvidenceFileSlot,
    files: FileList | null,
  ) => void;
  onRemoveFile: (
    templateId: CareerEvidenceTemplateId,
    key: string,
    slot?: EvidenceFileSlot,
  ) => void;
  template: BuilderEvidenceTemplate;
}) {
  const stateLabel = getEvidenceStateLabel(template, draft);
  const statePillVariant = getEvidenceStatePillVariant(template, draft);
  const statePillClassName =
    statePillVariant === "verified"
      ? `${styles.statusBadge} ${styles.statusBadgeVerified}`
      : statePillVariant === "partial"
        ? `${styles.statusBadge} ${styles.statusBadgePartial}`
        : styles.statusBadge;

  return (
    <article className={styles.evidenceCard}>
      <header className={styles.evidenceCardHeader}>
        <div className={styles.evidenceHeaderCopy}>
          <h3 className={styles.evidenceTitle}>{template.title}</h3>
          <p className={styles.evidenceGuidance}>{template.guidance}</p>
        </div>

        <div className={styles.evidenceHeaderMeta}>
          <div className={styles.evidencePillRow}>
            <span className={statePillClassName}>{stateLabel}</span>
          </div>
          <p className={styles.formatHint}>{template.acceptedFormats}</p>
        </div>
      </header>

      {isDriverLicenseTemplate(template) ? (
        <EvidenceGroup
          className={styles.evidenceUploadGroup}
          copy="Add the required front and back images to finish this identity proof."
          label="Required images"
        >
          <div className={styles.uploadSlotGrid}>
            {driversLicenseImageSlots.map(({ key, label }) => {
              const existing = draft.files.find((file) => file.slot === key);

              return (
                <div className={styles.uploadSlot} key={`${template.id}-${key}`}>
                  <span className={styles.fieldLabel}>{label}</span>
                  <label className={styles.uploadZone} htmlFor={`upload-${template.id}-${key}`}>
                    <input
                      accept="image/*"
                      className={styles.fileInput}
                      id={`upload-${template.id}-${key}`}
                      onChange={(event) =>
                        onDriverLicenseFile(template.id, key, event.target.files)
                      }
                      type="file"
                    />
                    <Upload aria-hidden="true" size={18} strokeWidth={2} />
                    <div>
                      <strong>{existing ? "Replace image" : `Upload ${label.toLowerCase()}`}</strong>
                      <span>Image only. Drag and drop or click to browse.</span>
                    </div>
                  </label>

                  {existing ? (
                    <div className={styles.fileChipRow}>
                      <div className={styles.fileChip}>
                        <div>
                          <strong>{existing.name}</strong>
                          <small>{existing.sizeLabel}</small>
                        </div>

                        <button
                          className={styles.fileChipRemove}
                          onClick={() => onRemoveFile(template.id, existing.key, key)}
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

          {errors?.files ? <p className={styles.fieldError}>{errors.files}</p> : null}
        </EvidenceGroup>
      ) : (
        <>
          <EvidenceGroup
            copy="Capture who issued this proof and when it was verified."
            label="Core metadata"
          >
            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Source / issuer</span>
                <input
                  aria-invalid={Boolean(errors?.sourceOrIssuer)}
                  className={styles.input}
                  onChange={(event) =>
                    onChange(template.id, "sourceOrIssuer", event.target.value)
                  }
                  placeholder={template.sourceHint}
                  type="text"
                  value={draft.sourceOrIssuer}
                />
                {errors?.sourceOrIssuer ? (
                  <span className={styles.fieldError}>{errors.sourceOrIssuer}</span>
                ) : null}
              </label>

              {template.id === "offer-letters" ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Role</span>
                  <input
                    aria-invalid={Boolean(errors?.role)}
                    className={styles.input}
                    onChange={(event) => onChange(template.id, "role", event.target.value)}
                    placeholder="e.g. Software Engineer"
                    type="text"
                    value={draft.role}
                  />
                  {errors?.role ? (
                    <span className={styles.fieldError}>{errors.role}</span>
                  ) : null}
                </label>
              ) : null}

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Verified or issued on</span>
                <input
                  aria-invalid={Boolean(errors?.issuedOn)}
                  className={styles.input}
                  onChange={(event) => onChange(template.id, "issuedOn", event.target.value)}
                  type="date"
                  value={draft.issuedOn}
                />
                {errors?.issuedOn ? (
                  <span className={styles.fieldError}>{errors.issuedOn}</span>
                ) : null}
              </label>
            </div>
          </EvidenceGroup>

          <EvidenceGroup
            copy="Explain what this proof validates and why it matters to the profile."
            label="Validation meaning"
          >
            <div className={styles.fieldStack}>
              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.fieldLabel}>Validation context</span>
                <textarea
                  className={`${styles.textarea} ${styles.contextTextarea}`}
                  onChange={(event) =>
                    onChange(template.id, "validationContext", event.target.value)
                  }
                  placeholder={template.contextHint}
                  rows={4}
                  value={draft.validationContext}
                />
              </label>

              <label className={`${styles.field} ${styles.fieldFull}`}>
                <span className={styles.fieldLabel}>Why this should matter in soul.md</span>
                <textarea
                  className={`${styles.textarea} ${styles.impactTextarea}`}
                  onChange={(event) =>
                    onChange(template.id, "whyItMatters", event.target.value)
                  }
                  placeholder="Add the signal, overlap, or milestone this evidence should reinforce."
                  rows={3}
                  value={draft.whyItMatters}
                />
              </label>
            </div>
          </EvidenceGroup>

          <EvidenceGroup
            className={styles.evidenceUploadGroup}
            copy="Upload the supporting file that backs this evidence record."
            label="Final attachment"
          >
            <label className={styles.uploadZone} htmlFor={`upload-${template.id}`}>
              <input
                accept={defaultUploadAccept}
                className={styles.fileInput}
                id={`upload-${template.id}`}
                multiple
                onChange={(event) => onDefaultFiles(template.id, event.target.files)}
                type="file"
              />
              <Upload aria-hidden="true" size={18} strokeWidth={2} />
              <div>
                <strong>Upload supporting evidence</strong>
                <span>{`Drag and drop or click to browse. ${template.acceptedFormats}`}</span>
              </div>
            </label>

            {errors?.files ? <p className={styles.fieldError}>{errors.files}</p> : null}

            {draft.files.length > 0 ? (
              <div className={styles.fileChipRow}>
                {draft.files.map((file) => (
                  <div className={styles.fileChip} key={file.key}>
                    <div>
                      <strong>{file.name}</strong>
                      <small>{file.sizeLabel}</small>
                    </div>

                    <button
                      className={styles.fileChipRemove}
                      onClick={() => onRemoveFile(template.id, file.key, file.slot)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </EvidenceGroup>
        </>
      )}
    </article>
  );
}

export function AgentBuilderWorkspace({
  initialSnapshot,
}: AgentBuilderWorkspaceProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activePhase, setActivePhase] = useState<CareerPhase | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<CareerEvidenceTemplateId | null>(null);
  const [draft, setDraft] = useState<ModalDraftState>({
    profile: toProfileInput(initialSnapshot.profile),
    evidence: {},
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<
    { text: string; kind: "success" | "error" } | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGovernmentModalOpen, setIsGovernmentModalOpen] = useState(false);
  const [governmentModalStep, setGovernmentModalStep] =
    useState<GovernmentVerificationModalStep>("intro");
  const [governmentConsentChecked, setGovernmentConsentChecked] = useState(false);
  const [governmentError, setGovernmentError] = useState<string | null>(null);
  const [governmentInlineError, setGovernmentInlineError] = useState<string | null>(null);
  const [isResettingGovernmentVerification, setIsResettingGovernmentVerification] = useState(false);
  const [isGovernmentActionPending, setIsGovernmentActionPending] = useState(false);
  const [governmentVerificationId, setGovernmentVerificationId] = useState<string | null>(
    initialSnapshot.documentVerification.verificationId,
  );
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const handledReturnRef = useRef(false);
  const governmentPollAttemptsRef = useRef(0);
  const initialDraftSignatureRef = useRef("");
  const titleId = useId();
  const governmentTitleId = useId();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    setGovernmentVerificationId(snapshot.documentVerification.verificationId);
  }, [snapshot.documentVerification.verificationId]);

  useEffect(() => {
    if (governmentModalStep !== "processing" || !governmentVerificationId) {
      governmentPollAttemptsRef.current = 0;
    }
  }, [governmentModalStep, governmentVerificationId]);

  useEffect(() => {
    if (!activePhase && !isGovernmentModalOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();

        if (isGovernmentModalOpen) {
          closeGovernmentVerificationModal();
          return;
        }

        if (!isSaving) {
          void requestClose();
        }
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusable = getFocusableElements(modalRef.current);

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeydown);
    const focusFrame = window.requestAnimationFrame(() => {
      const focusable = modalRef.current ? getFocusableElements(modalRef.current) : [];
      (focusable[0] ?? modalRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [activePhase, isGovernmentActionPending, isGovernmentModalOpen, isSaving]);

  const activePhaseData = useMemo(
    () => snapshot.phaseProgress.find((phase) => phase.phase === activePhase) ?? null,
    [activePhase, snapshot.phaseProgress],
  );
  const visiblePhaseProgress = useMemo(
    () => snapshot.phaseProgress.filter((phase) => phase.phase !== "institution"),
    [snapshot.phaseProgress],
  );
  const careerIdPhaseMap = useMemo(
    () =>
      new Map(
        snapshot.careerIdProfile.phases.map((phase) => [phase.key, phase] as const),
      ),
    [snapshot.careerIdProfile.phases],
  );
  const documentVerification = snapshot.documentVerification;
  const documentVerificationStatus = documentVerification.status;
  const isGovernmentBadgeVerified =
    documentVerificationStatus === "verified" && Boolean(documentVerification.artifactLabel);

  // Evidence rows that earned a credential card on the Career ID page.
  // Mirrors Stefano's government-badge pattern — only VERIFIED and PARTIAL
  // render. VERIFIED → "Issued" (blue). PARTIAL → "Evidence" (amber).
  const offerLetterCredentials = snapshot.evidence.filter(
    (record) =>
      record.templateId === "offer-letters" &&
      (record.verificationStatus === "VERIFIED" || record.verificationStatus === "PARTIAL"),
  );
  const documentHeroToneClassName =
    documentVerificationStatus === "verified"
      ? styles.documentHeroCardVerified
      : documentVerificationStatus === "in_progress" ||
          documentVerificationStatus === "manual_review"
        ? styles.documentHeroCardReview
        : documentVerificationStatus === "retry_needed" ||
            documentVerificationStatus === "failed"
          ? styles.documentHeroCardAlert
          : documentVerificationStatus === "locked"
            ? styles.documentHeroCardLocked
            : styles.documentHeroCardAvailable;

  const activeTemplates = useMemo(
    () =>
      activePhase
        ? builderEvidenceTemplates.filter((template) =>
            builderPhaseTemplateIds[activePhase].includes(template.id),
          )
        : [],
    [activePhase],
  );

  const activeTemplate = useMemo(
    () =>
      activeTemplates.find((template) => template.id === activeTemplateId) ??
      activeTemplates[0] ??
      null,
    [activeTemplateId, activeTemplates],
  );

  const activeTemplateIndex = activeTemplate
    ? activeTemplates.findIndex((template) => template.id === activeTemplate.id)
    : -1;

  const isDirty =
    activePhase !== null &&
    serializePhaseDraft(activePhase, draft) !== initialDraftSignatureRef.current;

  useEffect(() => {
    if (!activePhase || activePhase === "self" || activeTemplates.length === 0) {
      setActiveTemplateId(null);
      return;
    }

    setActiveTemplateId((current) =>
      current && activeTemplates.some((template) => template.id === current)
        ? current
        : activeTemplates[0]?.id ?? null,
    );
  }, [activePhase, activeTemplates]);

  const refreshSnapshot = useEffectEvent(async () => {
    const response = await fetch("/api/v1/career-builder", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? "Refreshing Career ID state failed.");
    }

    const nextSnapshot = (await response.json()) as CareerBuilderSnapshotDto;

    startTransition(() => {
      setSnapshot(nextSnapshot);
    });

    return nextSnapshot;
  });

  const refreshGovernmentVerification = useEffectEvent(async (verificationId: string) => {
    const response = await fetch(`/api/v1/career-id/verifications/${verificationId}`, {
      method: "GET",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(
        payload?.message ?? "Refreshing verification status failed.",
      ) as GovernmentVerificationRequestError;
      error.statusCode = response.status;
      error.errorCode = typeof payload?.error_code === "string" ? payload.error_code : null;
      throw error;
    }

    setGovernmentVerificationId(payload.verificationId ?? verificationId);
    const nextSnapshot = await refreshSnapshot();
    const payloadStatus = payload?.status as CareerIdVerificationStatus | undefined;
    const nextStatus = (payloadStatus ??
      nextSnapshot.documentVerification.status) as CareerIdVerificationStatus;
    setGovernmentModalStep(nextStatus === "in_progress" ? "processing" : "result");

    return {
      nextSnapshot,
      status: nextStatus,
    };
  });

  const handleGovernmentVerificationRefreshError = useEffectEvent(async (error: unknown) => {
    const fallbackMessage = "Refreshing verification status failed.";
    const message = error instanceof Error ? error.message : fallbackMessage;
    const statusCode =
      typeof (error as GovernmentVerificationRequestError | null | undefined)?.statusCode === "number"
        ? (error as GovernmentVerificationRequestError).statusCode
        : null;
    const errorCode =
      typeof (error as GovernmentVerificationRequestError | null | undefined)?.errorCode === "string"
        ? (error as GovernmentVerificationRequestError).errorCode
        : null;

    if (statusCode === 404 || errorCode === "NOT_FOUND") {
      setGovernmentVerificationId(null);
      setGovernmentModalStep("intro");
      setGovernmentError(
        "This verification session is no longer active. Start a new verification.",
      );

      try {
        await refreshSnapshot();
      } catch {
        // Keep the current snapshot if the refresh fails.
      }
      return;
    }

    setGovernmentError(message);
  });

  function openPhase(phase: CareerPhase) {
    if (phase === "institution") {
      return;
    }

    const nextDraft = buildPhaseDraft(snapshot, phase);
    setActivePhase(phase);
    setDraft(nextDraft);
    setFieldErrors({});
    setGlobalError(null);
    setSaveMessage(null);
    initialDraftSignatureRef.current = serializePhaseDraft(phase, nextDraft);
  }

  async function requestClose() {
    if (isSaving) {
      return;
    }

    if (isDirty && typeof window !== "undefined") {
      const shouldDiscard = window.confirm(
        "Discard unsaved changes for this trust phase?",
      );

      if (!shouldDiscard) {
        return;
      }
    }

    const closingPhase = activePhase;
    setActivePhase(null);
    setFieldErrors({});
    setGlobalError(null);
    setSaveMessage(null);
    initialDraftSignatureRef.current = "";

    if (closingPhase) {
      window.requestAnimationFrame(() => {
        triggerRefs.current[closingPhase]?.focus();
      });
    }
  }

  function openGovernmentVerificationModal() {
    if (!documentVerification.unlocked) {
      return;
    }

    setGovernmentInlineError(null);
    setGovernmentError(null);
    setGovernmentConsentChecked(false);
    setIsGovernmentModalOpen(true);

    if (documentVerificationStatus === "in_progress") {
      setGovernmentModalStep("processing");
      return;
    }

    if (documentVerificationStatus === "manual_review") {
      setGovernmentModalStep("result");
      return;
    }

    if (
      documentVerificationStatus === "retry_needed" ||
      documentVerificationStatus === "failed"
    ) {
      setGovernmentModalStep("result");
      return;
    }

    setGovernmentModalStep("intro");
  }

  function closeGovernmentVerificationModal() {
    if (isGovernmentActionPending) {
      return;
    }

    setIsGovernmentModalOpen(false);
    setGovernmentError(null);
    setGovernmentConsentChecked(false);
  }

  async function launchGovernmentVerificationFlow() {
    setGovernmentInlineError(null);
    setGovernmentError(null);
    setIsGovernmentActionPending(true);

    try {
      const endpoint =
        documentVerification.retryable && documentVerification.evidenceId
          ? `/api/v1/career-id/evidence/${documentVerification.evidenceId}/retry`
          : "/api/v1/career-id/verifications/government-id/session";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          returnUrl: window.location.pathname,
          source: "career_id_page",
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setGovernmentError(payload?.message ?? "Starting identity verification failed.");
        return;
      }

      setGovernmentVerificationId(payload.verificationId ?? null);
      window.location.assign(String(payload.launchUrl));
    } catch (error) {
      setGovernmentError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while starting verification.",
      );
    } finally {
      setIsGovernmentActionPending(false);
    }
  }

  async function resetGovernmentVerificationState() {
    if (isResettingGovernmentVerification) {
      return;
    }

    const shouldReset =
      typeof window === "undefined"
        ? false
        : window.confirm(
            "Reset government ID verification for this account and start over from scratch?",
          );

    if (!shouldReset) {
      return;
    }

    setGovernmentInlineError(null);
    setGovernmentError(null);
    setIsResettingGovernmentVerification(true);

    try {
      const response = await fetch("/api/v1/career-id/verifications/government-id/session", {
        method: "DELETE",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "Resetting identity verification failed.");
      }

      setGovernmentVerificationId(null);
      setGovernmentModalStep("intro");
      setGovernmentConsentChecked(false);
      setIsGovernmentModalOpen(false);
      await refreshSnapshot();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Resetting identity verification failed.";
      setGovernmentInlineError(message);
      setGovernmentError(message);
    } finally {
      setIsResettingGovernmentVerification(false);
    }
  }

  useEffect(() => {
    if (handledReturnRef.current || typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const returnedVerificationId = params.get("careerIdVerificationId");

    if (!returnedVerificationId) {
      return;
    }

    handledReturnRef.current = true;
    setIsGovernmentModalOpen(true);
    setGovernmentModalStep("processing");
    setGovernmentVerificationId(returnedVerificationId);
    setGovernmentError(null);

    void refreshGovernmentVerification(returnedVerificationId).catch((error) => {
      void handleGovernmentVerificationRefreshError(error);
    });

    window.history.replaceState({}, "", window.location.pathname);
  }, [handleGovernmentVerificationRefreshError, refreshGovernmentVerification]);

  useEffect(() => {
    if (
      !isGovernmentModalOpen ||
      governmentModalStep !== "processing" ||
      !governmentVerificationId
    ) {
      return;
    }

    if (governmentPollAttemptsRef.current >= GOVERNMENT_VERIFICATION_MAX_AUTO_POLLS) {
      setGovernmentModalStep("result");
      setGovernmentError(
        "Verification is taking longer than expected. Use Refresh status to check again.",
      );
      return;
    }

    const timer = window.setTimeout(() => {
      governmentPollAttemptsRef.current += 1;
      void refreshGovernmentVerification(governmentVerificationId).catch((error) => {
        void handleGovernmentVerificationRefreshError(error);
      });
    }, GOVERNMENT_VERIFICATION_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    governmentModalStep,
    governmentVerificationId,
    handleGovernmentVerificationRefreshError,
    isGovernmentModalOpen,
    refreshGovernmentVerification,
  ]);

  function updateProfileField(field: keyof CareerProfileInput, value: string) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      profile: {
        ...currentDraft.profile,
        [field]: value,
      },
    }));

    if (fieldErrors.profile?.[field]) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        profile: {
          ...currentErrors.profile,
          [field]: "",
        },
      }));
    }
  }

  function updateEvidenceField(
    templateId: CareerEvidenceTemplateId,
    field: keyof Omit<EvidenceDraftState, "files" | "templateId">,
    value: string,
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      evidence: {
        ...currentDraft.evidence,
        [templateId]: {
          ...currentDraft.evidence[templateId],
          [field]: value,
        },
      },
    }));

    if (fieldErrors[templateId]?.[field]) {
      setFieldErrors((currentErrors) => ({
        ...currentErrors,
        [templateId]: {
          ...currentErrors[templateId],
          [field]: "",
        },
      }));
    }
  }

  function addFiles(templateId: CareerEvidenceTemplateId, files: FileList | null) {
    const nextFiles = Array.from(files ?? []).map((file) => ({
      artifactId: `new-${crypto.randomUUID()}`,
      file,
      isNew: true,
      key: `new-${crypto.randomUUID()}`,
      mimeType: file.type || "application/octet-stream",
      name: file.name,
      sizeLabel: formatBytes(file.size),
      uploadedAt: new Date().toISOString(),
    }));

    if (nextFiles.length === 0) {
      return;
    }

    setDraft((currentDraft) => {
      const existing = currentDraft.evidence[templateId];

      return {
        ...currentDraft,
        evidence: {
          ...currentDraft.evidence,
          [templateId]: {
            ...existing,
            files: [...existing.files, ...nextFiles],
          },
        },
      };
    });
  }

  function addDriverLicenseFile(
    templateId: CareerEvidenceTemplateId,
    slot: EvidenceFileSlot,
    files: FileList | null,
  ) {
    const nextFile = Array.from(files ?? []).at(0);

    if (!nextFile) {
      return;
    }

    setDraft((currentDraft) => {
      const existing = currentDraft.evidence[templateId];
      const remaining = existing.files.filter((file) => file.slot !== slot);

      return {
        ...currentDraft,
        evidence: {
          ...currentDraft.evidence,
          [templateId]: {
            ...existing,
            files: [
              ...remaining,
              {
                artifactId: `new-${crypto.randomUUID()}`,
                file: nextFile,
                isNew: true,
                key: `new-${crypto.randomUUID()}`,
                mimeType: nextFile.type || "application/octet-stream",
                name: nextFile.name,
                sizeLabel: formatBytes(nextFile.size),
                slot,
                uploadedAt: new Date().toISOString(),
              },
            ],
          },
        },
      };
    });
  }

  function removeDraftFile(
    templateId: CareerEvidenceTemplateId,
    key: string,
  ) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      evidence: {
        ...currentDraft.evidence,
        [templateId]: {
          ...currentDraft.evidence[templateId],
          files: currentDraft.evidence[templateId].files.filter((file) => file.key !== key),
        },
      },
    }));
  }

  function selectTemplate(templateId: CareerEvidenceTemplateId) {
    setActiveTemplateId(templateId);
  }

  function moveTemplate(direction: "next" | "previous") {
    if (!activeTemplate) {
      return;
    }

    const nextIndex =
      direction === "next"
        ? Math.min(activeTemplateIndex + 1, activeTemplates.length - 1)
        : Math.max(activeTemplateIndex - 1, 0);
    const nextTemplate = activeTemplates[nextIndex];

    if (nextTemplate) {
      setActiveTemplateId(nextTemplate.id);
    }
  }

  async function handleSave() {
    if (!activePhase) {
      return;
    }

    const nextErrors = validatePhaseDraft(activePhase, draft);

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setGlobalError("Fix the highlighted fields before saving this phase.");
      return;
    }

    setIsSaving(true);
    setGlobalError(null);
    setSaveMessage(null);

    try {
      const payload: {
        evidence: Array<{
          issuedOn: string;
          retainedArtifactIds: string[];
          sourceOrIssuer: string;
          role: string;
          templateId: CareerEvidenceTemplateId;
          validationContext: string;
          whyItMatters: string;
        }>;
        profile?: CareerProfileInput;
      } = {
        evidence: activePhase === "self"
          ? []
          : builderPhaseTemplateIds[activePhase].map((templateId) => {
              const evidenceDraft = draft.evidence[templateId];

              return {
                templateId,
                sourceOrIssuer: evidenceDraft.sourceOrIssuer,
                role: evidenceDraft.role ?? "",
                issuedOn: evidenceDraft.issuedOn,
                validationContext: evidenceDraft.validationContext,
                whyItMatters: evidenceDraft.whyItMatters,
                retainedArtifactIds: evidenceDraft.files
                  .filter((file) => !file.isNew)
                  .map((file) => file.artifactId),
              };
            }),
      };

      if (activePhase === "self") {
        payload.profile = draft.profile;
      }

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));

      if (activePhase !== "self") {
        for (const templateId of builderPhaseTemplateIds[activePhase]) {
          for (const file of draft.evidence[templateId].files.filter((item) => item.isNew && item.file)) {
            const fieldKey = file.slot
              ? `upload:${templateId}:${file.slot}`
              : `upload:${templateId}`;
            formData.append(fieldKey, file.file!);
          }
        }
      }

      const response = await fetch(`/api/v1/career-builder/phases/${activePhase}`, {
        method: "POST",
        body: formData,
      });
      const body = await response.json();

      if (!response.ok) {
        const apiErrors = body?.details?.errors;

        if (apiErrors && typeof apiErrors === "object") {
          setFieldErrors(apiErrors as FieldErrors);
        }

        setGlobalError(body?.message ?? "Saving this phase failed.");
        return;
      }

      const nextSnapshot = body as CareerBuilderSnapshotDto;
      // Prefer the generic claimVerifications array (covers all four
      // claim types). Fall back to the legacy offerLetterVerifications
      // field so responses from older servers still produce a message.
      const claimVerifications =
        (body as { claimVerifications?: ClaimVerificationEntry[] }).claimVerifications ??
        (body as { offerLetterVerifications?: ClaimVerificationEntry[] }).offerLetterVerifications;

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });

      const nextDraft = buildPhaseDraft(nextSnapshot, activePhase);
      setDraft(nextDraft);
      setFieldErrors({});
      setGlobalError(null);
      setSaveMessage(formatSaveMessage(claimVerifications));
      initialDraftSignatureRef.current = serializePhaseDraft(activePhase, nextDraft);
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : "An unexpected error occurred while saving.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const modal =
    isMounted && activePhase
      ? createPortal(
          <div
            className={styles.overlay}
            onClick={() => {
              void requestClose();
            }}
            role="presentation"
          >
            <div
              aria-labelledby={titleId}
              aria-modal="true"
              className={styles.modal}
              onClick={(event) => {
                event.stopPropagation();
              }}
              ref={modalRef}
              role="dialog"
              tabIndex={-1}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalHeaderCopy}>
                  <span className={styles.sectionEyebrow}>Career ID trust phase</span>
                  <h2 className={styles.modalTitle} id={titleId}>
                    {phaseMeta[activePhase].modalTitle}
                  </h2>
                  <p className={styles.modalCopy}>{phaseMeta[activePhase].modalSubtitle}</p>
                </div>

                <div className={styles.modalHeaderMeta}>
                  {activePhaseData ? (
                    <PhaseCount
                      completed={activePhaseData.completed}
                      total={activePhaseData.total}
                    />
                  ) : null}

                  <button
                    aria-label={`Close ${phaseMeta[activePhase].label} modal`}
                    className={styles.closeButton}
                    onClick={() => {
                      void requestClose();
                    }}
                    type="button"
                  >
                    <X size={18} strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div className={styles.modalScroll}>
                {activePhase === "self" ? (
                  <section className={styles.sectionPanel}>
                    <ol
                      aria-label="Self-reported foundation steps"
                      className={styles.selfStepList}
                    >
                      {profileFieldConfig.map((fieldConfig, index) => {
                        const isReady = draft.profile[fieldConfig.field].trim().length > 0;

                        return (
                          <li className={styles.selfStepItem} key={fieldConfig.field}>
                            <span
                              aria-hidden="true"
                              className={`${styles.selfStepMarker} ${
                                isReady ? styles.selfStepMarkerComplete : ""
                              }`}
                            >
                              {isReady ? <Check size={14} strokeWidth={2.6} /> : index + 1}
                            </span>

                            <div className={styles.selfStepContent}>
                              <strong>{fieldConfig.label}</strong>
                              <span>{isReady ? "Ready" : "Add this field"}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ol>

                    <div className={styles.fieldGrid}>
                      {profileFieldConfig.map((fieldConfig) => (
                        <label
                          className={
                            "rows" in fieldConfig
                              ? `${styles.field} ${styles.fieldFull}`
                              : styles.field
                          }
                          key={fieldConfig.field}
                        >
                          <span className={styles.fieldLabel}>{fieldConfig.label}</span>
                          {"rows" in fieldConfig ? (
                            <textarea
                              className={styles.textarea}
                              onChange={(event) =>
                                updateProfileField(fieldConfig.field, event.target.value)
                              }
                              placeholder={fieldConfig.placeholder}
                              rows={fieldConfig.rows}
                              value={draft.profile[fieldConfig.field]}
                            />
                          ) : (
                            <input
                              className={styles.input}
                              onChange={(event) =>
                                updateProfileField(fieldConfig.field, event.target.value)
                              }
                              placeholder={fieldConfig.placeholder}
                              type="text"
                              value={draft.profile[fieldConfig.field]}
                            />
                          )}

                          {fieldErrors.profile?.[fieldConfig.field] ? (
                            <span className={styles.fieldError}>
                              {fieldErrors.profile[fieldConfig.field]}
                            </span>
                          ) : null}
                        </label>
                      ))}
                    </div>
                  </section>
                ) : (
                  <>
                    {activePhase === "signature" ? (
                      <div className={styles.infoBanner}>
                        <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
                        <p>
                          Signature-backed views reuse canonical evidence records. Editing a shared
                          item here updates the same saved record anywhere else it appears.
                        </p>
                      </div>
                    ) : null}

                    {activeTemplate ? (
                      <>
                        {activeTemplates.length > 1 ? (
                          <section className={styles.templateNavigator}>
                            <div className={styles.templateNavigatorControls}>
                              <div className={styles.templateNavButtons}>
                                <button
                                  className={styles.templateNavButton}
                                  disabled={activeTemplateIndex <= 0}
                                  onClick={() => {
                                    moveTemplate("previous");
                                  }}
                                  type="button"
                                >
                                  <ChevronLeft aria-hidden="true" size={16} strokeWidth={2.4} />
                                  <span>Previous</span>
                                </button>

                                <button
                                  className={styles.templateNavButton}
                                  disabled={activeTemplateIndex >= activeTemplates.length - 1}
                                  onClick={() => {
                                    moveTemplate("next");
                                  }}
                                  type="button"
                                >
                                  <span>Next</span>
                                  <ChevronRight aria-hidden="true" size={16} strokeWidth={2.4} />
                                </button>
                              </div>
                            </div>

                            <div
                              aria-label="Trust phase steps"
                              className={styles.templatePillRow}
                              role="tablist"
                            >
                              {activeTemplates.map((template, index) => {
                                const isActiveTemplate = template.id === activeTemplate.id;

                                return (
                                  <button
                                    aria-label={`Step ${index + 1}: ${template.title}`}
                                    aria-selected={isActiveTemplate}
                                    className={`${styles.templatePillButton} ${
                                      isActiveTemplate ? styles.templatePillButtonActive : ""
                                    }`}
                                    key={template.id}
                                    onClick={() => {
                                      selectTemplate(template.id);
                                    }}
                                    role="tab"
                                    type="button"
                                  >
                                    <span className={styles.templatePillIndex}>{index + 1}</span>
                                    <span className={styles.templatePillLabel}>
                                      <strong>{template.title}</strong>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        ) : null}

                        <section className={styles.sectionPanel}>
                          <div className={styles.evidenceGrid}>
                            <EvidenceCard
                              draft={draft.evidence[activeTemplate.id]}
                              errors={fieldErrors[activeTemplate.id]}
                              key={activeTemplate.id}
                              onChange={updateEvidenceField}
                              onDefaultFiles={addFiles}
                              onDriverLicenseFile={addDriverLicenseFile}
                              onRemoveFile={removeDraftFile}
                              template={activeTemplate}
                            />
                          </div>
                        </section>
                      </>
                    ) : null}
                  </>
                )}
              </div>

              <div className={styles.modalFooter}>
                <div className={styles.modalStatusArea}>
                  {globalError ? (
                    <p className={styles.errorBanner}>
                      <AlertCircle aria-hidden="true" size={16} strokeWidth={2} />
                      <span>{globalError}</span>
                    </p>
                  ) : null}

                  {saveMessage ? (
                    saveMessage.kind === "error" ? (
                      <p className={styles.errorBanner}>
                        <AlertCircle aria-hidden="true" size={16} strokeWidth={2} />
                        <span>{saveMessage.text}</span>
                      </p>
                    ) : (
                      <p className={styles.successBanner}>{saveMessage.text}</p>
                    )
                  ) : null}
                </div>

                <div className={styles.modalActions}>
                  <button
                    className={styles.secondaryAction}
                    onClick={() => {
                      void requestClose();
                    }}
                    type="button"
                  >
                    Close
                  </button>

                  <button
                    className={styles.primaryAction}
                    disabled={isSaving}
                    onClick={() => {
                      void handleSave();
                    }}
                    type="button"
                  >
                    {isSaving ? (
                      <>
                        <LoaderCircle aria-hidden="true" className={styles.spinningIcon} size={16} />
                        Saving
                      </>
                    ) : (
                      phaseMeta[activePhase].actionLabel
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;
  const governmentModal =
    isMounted && isGovernmentModalOpen
      ? createPortal(
          <div
            className={styles.overlay}
            onClick={closeGovernmentVerificationModal}
            role="presentation"
          >
            <div
              aria-labelledby={governmentTitleId}
              aria-modal="true"
              className={`${styles.modal} ${styles.governmentModal}`}
              onClick={(event) => {
                event.stopPropagation();
              }}
              ref={modalRef}
              role="dialog"
              tabIndex={-1}
            >
              <div className={styles.modalHeader}>
                <div className={styles.modalHeaderCopy}>
                  <span className={styles.sectionEyebrow}>Document-backed verification</span>
                  <h2 className={styles.modalTitle} id={governmentTitleId}>
                    {governmentModalStep === "intro"
                      ? "Strengthen your Career ID"
                      : governmentModalStep === "consent"
                        ? "Before you begin"
                        : governmentModalStep === "processing"
                          ? "Verifying your identity"
                          : documentVerificationStatus === "verified"
                            ? "Identity verified"
                            : documentVerificationStatus === "in_progress"
                              ? "Verification in progress"
                            : documentVerificationStatus === "manual_review"
                              ? "Verification under review"
                              : documentVerificationStatus === "retry_needed"
                                ? "We couldn't complete verification"
                                : "Verification not completed"}
                  </h2>
                  <p className={styles.modalCopy}>
                    {governmentModalStep === "intro"
                      ? "Verify a government ID and complete a live selfie check to make your Career ID more credible."
                      : governmentModalStep === "consent"
                        ? "We'll collect your government ID and a live selfie for identity verification. Your Career ID updates only after Persona confirms the result."
                      : governmentModalStep === "processing"
                          ? "We're reviewing your ID and comparing it with your live selfie."
                          : documentVerificationStatus === "verified"
                            ? "Your Career ID now includes a verified government ID artifact."
                            : documentVerificationStatus === "in_progress"
                              ? "Verification is still processing. You can refresh status to check for completion."
                            : documentVerificationStatus === "manual_review"
                              ? "Your submission is being reviewed. We'll update your Career ID when it's complete."
                              : documentVerificationStatus === "retry_needed"
                                ? "Try again with better lighting, a clearer photo of your ID, and your full face visible."
                                : "Verification wasn't completed this time. You can try again when you're ready."}
                  </p>
                </div>

                <div className={styles.modalHeaderMeta}>
                  <button
                    aria-label="Close identity verification modal"
                    className={styles.closeButton}
                    onClick={closeGovernmentVerificationModal}
                    type="button"
                  >
                    <X size={18} strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              <div className={styles.modalScroll}>
                {governmentModalStep === "intro" ? (
                  <section className={styles.sectionPanel}>
                    <div className={styles.verificationHeroMeta}>
                      <span className={styles.supportChip}>{documentVerification.estimatedTimeLabel}</span>
                      <span className={styles.supportChip}>Driver's license + live selfie</span>
                    </div>

                    <p className={styles.verificationBodyCopy}>
                      {documentVerification.explanation}
                    </p>

                    <div className={styles.verificationPreviewGrid}>
                      <article className={styles.verificationPreviewCard}>
                        <strong>Front of ID</strong>
                        <span>Use good lighting and make sure all edges are visible.</span>
                      </article>
                      <article className={styles.verificationPreviewCard}>
                        <strong>Back of ID</strong>
                        <span>Capture the back clearly with no blur or glare.</span>
                      </article>
                      <article className={styles.verificationPreviewCard}>
                        <strong>Live selfie</strong>
                        <span>Keep your full face visible and look straight ahead.</span>
                      </article>
                    </div>

                    <div className={styles.infoBanner}>
                      <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
                      <p>
                        You&apos;ll capture the front and back of your ID plus the live selfie in
                        Persona after you continue. Career AI stores the verification result,
                        timestamps, and encrypted Persona reference after verification confirmation
                        instead of raw ID photos or selfie files in this modal.
                      </p>
                    </div>
                  </section>
                ) : null}

                {governmentModalStep === "consent" ? (
                  <section className={styles.sectionPanel}>
                    <div className={styles.verificationBodyStack}>
                      <p className={styles.verificationBodyCopy}>
                        After you agree, we&apos;ll send you to Persona for the secure capture
                        flow. Your Career ID only changes after Persona confirms your verification.
                      </p>

                      <label className={styles.consentRow}>
                        <input
                          checked={governmentConsentChecked}
                          onChange={(event) => {
                            setGovernmentConsentChecked(event.target.checked);
                          }}
                          type="checkbox"
                        />
                        <span>I consent to identity verification for Career ID.</span>
                      </label>
                    </div>
                  </section>
                ) : null}

                {governmentModalStep === "processing" ? (
                  <section className={styles.sectionPanel}>
                    <div className={styles.processingCard}>
                      <LoaderCircle
                        aria-hidden="true"
                        className={styles.spinningIcon}
                        size={24}
                        strokeWidth={2}
                      />
                      <div>
                        <strong>{getDocumentStatusTagLabel(documentVerificationStatus)}</strong>
                        <p>{documentVerification.helperText}</p>
                      </div>
                    </div>
                  </section>
                ) : null}

                {governmentModalStep === "result" ? (
                  <section className={styles.sectionPanel}>
                    {documentVerification.artifactLabel ? (
                      <div className={styles.documentArtifactCard}>
                        <ShieldCheck aria-hidden="true" size={18} strokeWidth={2} />
                        <div>
                          <strong>{documentVerification.artifactLabel}</strong>
                          <span>{getDocumentStatusTagLabel(documentVerificationStatus)}</span>
                        </div>
                      </div>
                    ) : null}

                    {(documentVerificationStatus === "retry_needed" ||
                      documentVerificationStatus === "failed") &&
                    documentVerification.recoveryHints.length > 0 ? (
                      <ul className={styles.recoveryHintList}>
                        {documentVerification.recoveryHints.map((hint) => (
                          <li key={hint}>{hint}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : null}
              </div>

              <div className={styles.modalFooter}>
                <div className={styles.modalStatusArea}>
                  {governmentError ? (
                    <p className={styles.errorBanner}>
                      <AlertCircle aria-hidden="true" size={16} strokeWidth={2} />
                      <span>{governmentError}</span>
                    </p>
                  ) : null}
                </div>

                <div className={styles.modalActions}>
                  {governmentModalStep === "consent" ? (
                    <button
                      className={styles.secondaryAction}
                      onClick={() => {
                        setGovernmentModalStep("intro");
                      }}
                      type="button"
                    >
                      Back
                    </button>
                  ) : (
                    <button
                      className={styles.secondaryAction}
                      onClick={closeGovernmentVerificationModal}
                      type="button"
                    >
                      {governmentModalStep === "processing" ? "Close" : "Back to Career ID"}
                    </button>
                  )}

                  {governmentModalStep === "intro" ? (
                    <button
                      className={styles.primaryAction}
                      onClick={() => {
                        setGovernmentModalStep("consent");
                      }}
                      type="button"
                    >
                      Continue to secure capture
                    </button>
                  ) : null}

                  {governmentModalStep === "consent" ? (
                    <button
                      className={styles.primaryAction}
                      disabled={!governmentConsentChecked || isGovernmentActionPending}
                      onClick={() => {
                        void launchGovernmentVerificationFlow();
                      }}
                      type="button"
                    >
                      {isGovernmentActionPending ? (
                        <>
                          <LoaderCircle
                            aria-hidden="true"
                            className={styles.spinningIcon}
                            size={16}
                          />
                          Starting
                        </>
                      ) : (
                        "Open secure verification"
                      )}
                    </button>
                  ) : null}

                  {governmentModalStep === "processing" ? (
                    <button
                      className={styles.primaryAction}
                      disabled={isGovernmentActionPending || !governmentVerificationId}
                      onClick={() => {
                        if (!governmentVerificationId) {
                          return;
                        }

                        void refreshGovernmentVerification(governmentVerificationId).catch(
                          (error) => {
                            void handleGovernmentVerificationRefreshError(error);
                          },
                        );
                      }}
                      type="button"
                    >
                      Refresh status
                    </button>
                  ) : null}

                  {governmentModalStep === "result" &&
                  (documentVerificationStatus === "manual_review" ||
                    documentVerificationStatus === "in_progress") ? (
                    <button
                      className={styles.primaryAction}
                      disabled={isGovernmentActionPending || !governmentVerificationId}
                      onClick={() => {
                        if (!governmentVerificationId) {
                          return;
                        }

                        void refreshGovernmentVerification(governmentVerificationId).catch(
                          (error) => {
                            void handleGovernmentVerificationRefreshError(error);
                          },
                        );
                      }}
                      type="button"
                    >
                      Refresh status
                    </button>
                  ) : null}

                  {governmentModalStep === "result" && documentVerification.retryable ? (
                    <button
                      className={styles.primaryAction}
                      disabled={isGovernmentActionPending}
                      onClick={() => {
                        setGovernmentModalStep("consent");
                      }}
                      type="button"
                    >
                      {documentVerification.ctaLabel ?? "Try again"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <div className={styles.heroIntro}>
                <h1 className={styles.heroTitle}>Career ID Badges</h1>
              </div>

              {isGovernmentBadgeVerified ? (
                <section className={styles.identityBadgeCanvas}>
                  <div className={`${styles.identityBadgeCard} ${styles.identityBadgeCardVerified}`}>
                    <div className={styles.identityBadgeHeader}>
                      <span className={styles.identityBadgeProgram}>Career ID Credential</span>
                      <span className={styles.identityBadgeStatus}>Issued</span>
                    </div>

                    <div className={styles.identityBadgeBody}>
                      <span className={styles.identityBadgeIcon}>
                        <ShieldCheck aria-hidden="true" size={22} strokeWidth={2.1} />
                      </span>

                      <div className={styles.identityBadgeCopy}>
                        <strong>{documentVerification.artifactLabel}</strong>
                        <p>Verified by Persona and ready as trusted Career ID proof.</p>
                      </div>
                    </div>

                    <dl className={styles.identityBadgeMeta}>
                      <div>
                        <dt>Issuer</dt>
                        <dd>Career AI Trust</dd>
                      </div>
                      <div>
                        <dt>Evidence</dt>
                        <dd>Persona government ID + selfie</dd>
                      </div>
                    </dl>
                  </div>

                  <button
                    className={styles.identityBadgeResetButton}
                    disabled={isResettingGovernmentVerification}
                    onClick={() => {
                      void resetGovernmentVerificationState();
                    }}
                    type="button"
                  >
                    {isResettingGovernmentVerification ? "Resetting..." : "Reset verification state"}
                  </button>

                  {governmentInlineError ? (
                    <p className={styles.identityBadgeInlineError}>
                      <AlertCircle aria-hidden="true" size={14} strokeWidth={2} />
                      <span>{governmentInlineError}</span>
                    </p>
                  ) : null}
                </section>
              ) : null}

              {offerLetterCredentials.map((record) => {
                const isPartial = record.verificationStatus === "PARTIAL";
                const title = isPartial
                  ? "Offer letter on file"
                  : "Offer letter verified";
                const description = isPartial
                  ? "Sender domain couldn't be checked against the claimed employer."
                  : "Signed offer letter cross-checked against the claimed employer via DocuSign Certificate of Completion domain match.";
                const statusLabel = isPartial ? "Evidence" : "Issued";
                const evidenceDetail = [record.sourceOrIssuer, record.role]
                  .filter(Boolean)
                  .join(" • ") || "Offer letter";
                return (
                  <section key={record.id} className={styles.identityBadgeCanvas}>
                    <div
                      className={`${styles.identityBadgeCard} ${
                        isPartial
                          ? styles.identityBadgeCardPartial
                          : styles.identityBadgeCardVerified
                      }`}
                    >
                      <div className={styles.identityBadgeHeader}>
                        <span className={styles.identityBadgeProgram}>Career ID Credential</span>
                        <span className={styles.identityBadgeStatus}>{statusLabel}</span>
                      </div>

                      <div className={styles.identityBadgeBody}>
                        <span className={styles.identityBadgeIcon}>
                          <ShieldCheck aria-hidden="true" size={22} strokeWidth={2.1} />
                        </span>

                        <div className={styles.identityBadgeCopy}>
                          <strong>{title}</strong>
                          <p>{description}</p>
                        </div>
                      </div>

                      <dl className={styles.identityBadgeMeta}>
                        <div>
                          <dt>Issuer</dt>
                          <dd>Career AI Trust</dd>
                        </div>
                        <div>
                          <dt>Evidence</dt>
                          <dd>{evidenceDetail}</dd>
                        </div>
                      </dl>
                    </div>
                  </section>
                );
              })}
            </div>

            <aside className={styles.progressRail}>
              <section className={`${styles.documentHeroCard} ${documentHeroToneClassName}`}>
                <div className={styles.documentHeroBadgeRow}>
                  <span className={styles.documentHeroEyebrow}>
                    {getDocumentHeroEyebrow(documentVerificationStatus)}
                  </span>
                  <span className={styles.statusTag}>
                    {getDocumentStatusTagLabel(documentVerificationStatus)}
                  </span>
                </div>

                <div className={styles.documentHeroHeader}>
                  <span className={styles.documentHeroIcon}>
                    {getDocumentHeroIcon(documentVerificationStatus)}
                  </span>

                  <div className={styles.documentHeroBody}>
                    <h2 className={styles.documentHeroTitle}>
                      {getDocumentHeroTitle(documentVerificationStatus)}
                    </h2>
                    <p className={styles.documentHeroCopy}>{documentVerification.helperText}</p>
                  </div>
                </div>

                {documentVerification.ctaLabel || documentVerification.artifactLabel ? (
                  <div className={styles.documentHeroActions}>
                    {documentVerification.ctaLabel ? (
                      <button
                        className={styles.documentHeroCta}
                        onClick={openGovernmentVerificationModal}
                        type="button"
                      >
                        <span>{documentVerification.ctaLabel}</span>
                        <ArrowUpRight aria-hidden="true" size={16} strokeWidth={2.1} />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <div className={styles.pipelineSteps}>
                {visiblePhaseProgress.map((phase, index) => (
                  (() => {
                    const trustPhase = careerIdPhaseMap.get(phaseToTrustLayer(phase.phase));
                    const isDocumentPhase = phase.phase === "document";
                    const displayCompleted = trustPhase?.completedCount ?? phase.completed;
                    const displayTotal = trustPhase?.totalCount ?? phase.total;
                    const isComplete = isDocumentPhase
                      ? documentVerificationStatus === "verified"
                      : phase.isComplete;
                    const isCurrent = isDocumentPhase
                      ? documentVerificationStatus === "in_progress" ||
                        documentVerificationStatus === "manual_review"
                      : phase.isCurrent;
                    const isLocked = isDocumentPhase ? !documentVerification.unlocked : false;
                    const isAlert =
                      isDocumentPhase &&
                      (documentVerificationStatus === "retry_needed" ||
                        documentVerificationStatus === "failed");

                    return (
                      <article
                        className={`${styles.pipelineStepCard} ${
                          isComplete
                            ? styles.pipelineStepComplete
                            : isCurrent
                              ? styles.pipelineStepCurrent
                              : styles.pipelineStepPending
                        } ${isLocked ? styles.pipelineStepLocked : ""} ${
                          isAlert ? styles.pipelineStepAlert : ""
                        }`}
                        key={phase.phase}
                      >
                        <button
                          aria-controls={activePhase === phase.phase ? titleId : undefined}
                          aria-haspopup="dialog"
                          className={styles.pipelineStepButton}
                          disabled={isLocked}
                          onClick={() => openPhase(phase.phase)}
                          ref={(node) => {
                            triggerRefs.current[phase.phase] = node;
                          }}
                          type="button"
                        >
                          <div className={styles.pipelineTrack}>
                            <span className={styles.pipelineMarker}>
                              {isComplete ? (
                                <Check aria-hidden="true" size={16} strokeWidth={2.6} />
                              ) : isLocked ? (
                                <LockKeyhole aria-hidden="true" size={14} strokeWidth={2.2} />
                              ) : (
                                <span aria-hidden="true" className={styles.pipelineMarkerCore} />
                              )}
                            </span>
                            {index < visiblePhaseProgress.length - 1 ? (
                              <span
                                aria-hidden="true"
                                className={`${styles.pipelineConnector} ${
                                  isComplete ? styles.pipelineConnectorComplete : ""
                                }`}
                              />
                            ) : null}
                          </div>

                          <div className={styles.pipelineContent}>
                            <div className={styles.pipelineHeadingRow}>
                              <span className={styles.pipelinePill}>{phase.label}</span>
                              <PhaseCount completed={displayCompleted} total={displayTotal} />
                            </div>
                            <p className={styles.pipelineSummary}>
                              {isDocumentPhase ? documentVerification.helperText : phase.summary}
                            </p>
                          </div>
                        </button>

                        {isDocumentPhase ? (
                          <div className={styles.pipelineActionRow}>
                            {documentVerificationStatus !== "verified" ? (
                              <div className={styles.pipelineActionMeta}>
                                <span className={styles.statusTag}>
                                  {getDocumentStatusTagLabel(documentVerificationStatus)}
                                </span>
                              </div>
                            ) : null}

                            {documentVerification.artifactLabel ? (
                              <span className={styles.pipelineVerifiedCopy}>Verified by Persona</span>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })()
                ))}
              </div>

              <div className={styles.nextActionPanel}>
                <span className={styles.sectionEyebrow}>Next best uploads</span>
                <ul>
                  {snapshot.progress.nextUploads.map((template) => (
                    <li key={template.templateId}>{template.title}</li>
                  ))}
                </ul>
              </div>
            </aside>
          </section>
        </div>
      </main>

      {modal}
      {governmentModal}
    </>
  );
}
