"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  startTransition,
  useEffect,
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
  phaseSequence,
  type BuilderEvidenceTemplate,
} from "@/packages/career-builder-domain/src/config";
import type {
  CareerArtifactReference,
  CareerBuilderSnapshotDto,
  CareerEvidenceRecord,
  CareerEvidenceTemplateId,
  CareerPhase,
  CareerProfileInput,
  EvidenceFileSlot,
} from "@/packages/contracts/src";
import styles from "./agent-builder-workspace.module.css";

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
  templateId: CareerEvidenceTemplateId;
  validationContext: string;
  whyItMatters: string;
};

type ModalDraftState = {
  evidence: Record<string, EvidenceDraftState>;
  profile: CareerProfileInput;
};

type FieldErrors = Record<string, Record<string, string>>;

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

const sectionOrder = ["identity", "employment", "network"] as const;

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
  network: {
    copy: "Relationship signals that show how trusted people describe overlap, trust, and outcomes.",
    title: "Referrals and endorsements",
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
    issuedOn: record.issuedOn,
    validationContext: record.validationContext,
    whyItMatters: record.whyItMatters,
    files: record.files.map(toDraftFile),
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

  return (
    <article className={styles.evidenceCard}>
      <div className={styles.evidenceCardHeader}>
        <div>
          <h3 className={styles.evidenceTitle}>{template.title}</h3>
          <p className={styles.evidenceGuidance}>{template.guidance}</p>
        </div>

        <span className={styles.phaseTag}>{phaseMeta[template.completionTier].label}</span>
      </div>

      <div className={styles.evidenceMetaRow}>
        <span className={styles.statusBadge}>{stateLabel}</span>
        <span className={styles.formatHint}>{template.acceptedFormats}</span>
      </div>

      {isDriverLicenseTemplate(template) ? (
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
                    <span>Image only</span>
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

          {errors?.files ? <p className={styles.fieldError}>{errors.files}</p> : null}
        </div>
      ) : (
        <>
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

            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>Validation context</span>
              <textarea
                className={styles.textarea}
                onChange={(event) =>
                  onChange(template.id, "validationContext", event.target.value)
                }
                placeholder={template.contextHint}
                rows={3}
                value={draft.validationContext}
              />
            </label>

            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span className={styles.fieldLabel}>Why this should matter in soul.md</span>
              <textarea
                className={styles.textarea}
                onChange={(event) =>
                  onChange(template.id, "whyItMatters", event.target.value)
                }
                placeholder="Add the signal, overlap, or milestone this evidence should reinforce."
                rows={2}
                value={draft.whyItMatters}
              />
            </label>
          </div>

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
              <span>{template.acceptedFormats}</span>
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
  const [draft, setDraft] = useState<ModalDraftState>({
    profile: toProfileInput(initialSnapshot.profile),
    evidence: {},
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const initialDraftSignatureRef = useRef("");
  const titleId = useId();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    if (!activePhase) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        event.preventDefault();
        void requestClose();
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
  }, [activePhase, isSaving]);

  const activePhaseData = useMemo(
    () => snapshot.phaseProgress.find((phase) => phase.phase === activePhase) ?? null,
    [activePhase, snapshot.phaseProgress],
  );

  const activeTemplates = useMemo(
    () =>
      activePhase
        ? builderEvidenceTemplates.filter((template) =>
            builderPhaseTemplateIds[activePhase].includes(template.id),
          )
        : [],
    [activePhase],
  );

  const activeTemplateGroups = useMemo(
    () =>
      sectionOrder.map((section) => ({
        section,
        templates: activeTemplates.filter((template) => template.section === section),
      })),
    [activeTemplates],
  );

  const isDirty =
    activePhase !== null &&
    serializePhaseDraft(activePhase, draft) !== initialDraftSignatureRef.current;

  function openPhase(phase: CareerPhase) {
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

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });

      const nextDraft = buildPhaseDraft(nextSnapshot, activePhase);
      setDraft(nextDraft);
      setFieldErrors({});
      setGlobalError(null);
      setSaveMessage("Saved to your Career ID.");
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
                    <div className={styles.sectionHeader}>
                      <div>
                        <span className={styles.sectionEyebrow}>Structured intake</span>
                        <h3 className={styles.sectionTitle}>Self-reported foundation</h3>
                        <p className={styles.sectionCopy}>{phaseMeta.self.description}</p>
                      </div>

                      {activePhaseData ? (
                        <PhaseCount
                          completed={activePhaseData.completed}
                          total={activePhaseData.total}
                        />
                      ) : null}
                    </div>

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

                    {activeTemplateGroups.map(({ section, templates }) =>
                      templates.length > 0 ? (
                        <section className={styles.sectionPanel} key={section}>
                          <div className={styles.sectionHeader}>
                            <div>
                              <span className={styles.sectionEyebrow}>Structured intake</span>
                              <h3 className={styles.sectionTitle}>{sectionMeta[section].title}</h3>
                              <p className={styles.sectionCopy}>{sectionMeta[section].copy}</p>
                            </div>
                          </div>

                          <div className={styles.evidenceGrid}>
                            {templates.map((template) => (
                              <EvidenceCard
                                draft={draft.evidence[template.id]}
                                errors={fieldErrors[template.id]}
                                key={template.id}
                                onChange={updateEvidenceField}
                                onDefaultFiles={addFiles}
                                onDriverLicenseFile={addDriverLicenseFile}
                                onRemoveFile={removeDraftFile}
                                template={template}
                              />
                            ))}
                          </div>
                        </section>
                      ) : null,
                    )}
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

                  {saveMessage ? <p className={styles.successBanner}>{saveMessage}</p> : null}
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

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>Build and grow your Career ID</h1>
              <p className={styles.heroBody}>
                Create the living credibility profile behind your verified career identity.
                Keep the progress rail in view, open the phase you want to strengthen, and
                save each trust signal directly into your Career ID.
              </p>

              <div className={styles.statGrid}>
                <StatCard
                  label="overall builder progress"
                  value={`${snapshot.progress.overallProgress}%`}
                />
                <StatCard
                  label="uploaded evidence signals"
                  value={String(snapshot.progress.completedEvidenceCount).padStart(2, "0")}
                />
                <StatCard
                  label="strongest trust tier"
                  value={phaseMeta[snapshot.progress.strongestTier].label}
                />
              </div>

              <div className={styles.supportPanel}>
                <div className={styles.supportCard}>
                  <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
                  <div>
                    <strong>Phase-based intake</strong>
                    <p>Open a trust phase to edit the relevant intake without overloading the main page.</p>
                  </div>
                </div>

                <div className={styles.supportCard}>
                  <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2} />
                  <div>
                    <strong>Saved to your Career ID</strong>
                    <p>Each modal save persists profile details, evidence files, and readiness counts together.</p>
                  </div>
                </div>
              </div>
            </div>

            <aside className={styles.progressRail}>
              <div className={styles.progressRailHeader}>
                <span className={styles.sectionEyebrow}>Agent ID pipeline</span>
                <h2>Credible agent ID creation status</h2>
                <p className={styles.progressRailCopy}>
                  Each trust phase lights up as the profile moves from self-reported context
                  into stronger verification. Click any phase to edit its intake workflow.
                </p>
              </div>

              <div className={styles.pipelineSteps}>
                {snapshot.phaseProgress.map((phase, index) => (
                  <button
                    aria-controls={activePhase === phase.phase ? titleId : undefined}
                    aria-haspopup="dialog"
                    className={`${styles.pipelineStepButton} ${
                      phase.isComplete
                        ? styles.pipelineStepComplete
                        : phase.isCurrent
                          ? styles.pipelineStepCurrent
                          : styles.pipelineStepPending
                    }`}
                    key={phase.phase}
                    onClick={() => openPhase(phase.phase)}
                    ref={(node) => {
                      triggerRefs.current[phase.phase] = node;
                    }}
                    type="button"
                  >
                    <div className={styles.pipelineTrack}>
                      <span className={styles.pipelineMarker}>
                        {phase.isComplete ? (
                          <Check aria-hidden="true" size={16} strokeWidth={2.6} />
                        ) : (
                          <span aria-hidden="true" className={styles.pipelineMarkerCore} />
                        )}
                      </span>
                      {index < snapshot.phaseProgress.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className={`${styles.pipelineConnector} ${
                            phase.isComplete ? styles.pipelineConnectorComplete : ""
                          }`}
                        />
                      ) : null}
                    </div>

                    <div className={styles.pipelineContent}>
                      <div className={styles.pipelineHeadingRow}>
                        <span className={styles.pipelinePill}>{phase.label}</span>
                        <PhaseCount completed={phase.completed} total={phase.total} />
                      </div>
                      <p className={styles.pipelineSummary}>{phase.summary}</p>
                    </div>
                  </button>
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
    </>
  );
}
