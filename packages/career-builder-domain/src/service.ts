import {
  ApiError,
  careerBuilderPhaseSaveInputSchema,
  type CareerArtifactReference,
  type CareerBuilderPhaseSaveInput,
  type CareerBuilderSnapshotDto,
  type CareerEvidenceInput,
  type CareerEvidenceRecord,
  type CareerEvidenceStatus,
  type CareerPhase,
  type CareerProfileRecord,
  type EvidenceFileSlot,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { uploadArtifact } from "@/packages/artifact-domain/src";
import { createTalentIdentity, findTalentIdentityByEmail } from "@/packages/identity-domain/src";
import {
  getPersistentCareerBuilderProfile,
  listPersistentCareerBuilderEvidence,
  upsertPersistentCareerBuilderEvidence,
  upsertPersistentCareerBuilderProfile,
} from "@/packages/persistence/src";
import {
  builderEvidenceTemplates,
  builderPhaseTemplateIds,
  builderProfileFields,
  defaultUploadAccept,
  driversLicenseImageSlots,
  nextUploadPriority,
  phaseMeta,
  phaseSequence,
  type BuilderEvidenceTemplate,
} from "./config";
import { getCareerIdPresentation } from "@/packages/career-id-domain/src";

type BuilderViewer = {
  email: string;
  name?: string | null;
};

type SubmittedFile = {
  file: File;
  slot?: EvidenceFileSlot;
};

function splitDisplayName(name: string | null | undefined, email: string) {
  const trimmed = name?.trim();

  if (!trimmed) {
    const fallback = email.split("@")[0] ?? "Career";
    return {
      firstName: fallback,
      lastName: "User",
      displayName: fallback,
    };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const [firstName = "Career", ...rest] = parts;
  const lastName = rest.join(" ") || "User";

  return {
    firstName,
    lastName,
    displayName: trimmed,
  };
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isDriverLicenseTemplate(template: BuilderEvidenceTemplate) {
  return template.uploadKind === "drivers-license-images";
}

function createEmptyProfile(args: {
  talentIdentityId: string;
  soulRecordId: string;
  displayName: string;
}): CareerProfileRecord {
  const now = new Date().toISOString();

  return {
    talentIdentityId: args.talentIdentityId,
    soulRecordId: args.soulRecordId,
    legalName: args.displayName,
    careerHeadline: "",
    targetRole: "",
    location: "",
    coreNarrative: "",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Compound identity key for career_builder_evidence rows.
 *
 * The DB has UNIQUE(career_identity_id, template_id, source_or_issuer, role),
 * so in-memory lookups that want to find "the existing row for this
 * specific credential" must key by the same tuple. Keying by templateId
 * alone (the pre-widening shape) caused incoming saves for a new
 * (employer, role) to reuse an unrelated record's id during UPSERT and
 * blow up on the primary-key constraint.
 */
function buildEvidenceIdentityKey(
  templateId: string,
  sourceOrIssuer: string,
  role: string,
): string {
  return `${templateId}\u0000${sourceOrIssuer}\u0000${role}`;
}

function createEmptyEvidenceRecord(args: {
  talentIdentityId: string;
  soulRecordId: string;
  template: BuilderEvidenceTemplate;
}): CareerEvidenceRecord {
  const now = new Date().toISOString();

  return {
    id: `career_evidence_${crypto.randomUUID()}`,
    talentIdentityId: args.talentIdentityId,
    soulRecordId: args.soulRecordId,
    templateId: args.template.id,
    completionTier: args.template.completionTier,
    sourceOrIssuer: "",
    role: "",
    issuedOn: "",
    validationContext: "",
    whyItMatters: "",
    files: [],
    status: "NOT_STARTED",
    verificationStatus: null,
    createdAt: now,
    updatedAt: now,
  };
}

function hasProfileFieldValue(record: CareerProfileRecord, field: (typeof builderProfileFields)[number]) {
  return record[field].trim().length > 0;
}

function isEvidenceStarted(record: CareerEvidenceRecord) {
  return Boolean(
    record.files.length ||
      record.sourceOrIssuer.trim() ||
      record.issuedOn.trim() ||
      record.validationContext.trim() ||
      record.whyItMatters.trim(),
  );
}

function getSlottedArtifact(record: CareerEvidenceRecord, slot: EvidenceFileSlot) {
  return record.files.find((file) => file.slot === slot);
}

function getCompletedUploadCount(
  template: BuilderEvidenceTemplate,
  record: CareerEvidenceRecord,
) {
  if (!isDriverLicenseTemplate(template)) {
    return record.files.length;
  }

  return driversLicenseImageSlots.filter(({ key }) => getSlottedArtifact(record, key)).length;
}

function isEvidenceComplete(
  template: BuilderEvidenceTemplate,
  record: CareerEvidenceRecord,
) {
  if (isDriverLicenseTemplate(template)) {
    return getCompletedUploadCount(template, record) === driversLicenseImageSlots.length;
  }

  return record.files.length > 0;
}

function deriveEvidenceStatus(
  template: BuilderEvidenceTemplate,
  record: CareerEvidenceRecord,
): CareerEvidenceStatus {
  if (isEvidenceComplete(template, record)) {
    return "COMPLETE";
  }

  if (isEvidenceStarted(record)) {
    return "IN_PROGRESS";
  }

  return "NOT_STARTED";
}

function orderedDriverLicenseFiles(files: CareerArtifactReference[]) {
  return driversLicenseImageSlots.flatMap(({ key }) =>
    files.filter((file) => file.slot === key),
  );
}

function normalizeEvidenceRecord(
  template: BuilderEvidenceTemplate,
  record: CareerEvidenceRecord,
) {
  const files = isDriverLicenseTemplate(template)
    ? orderedDriverLicenseFiles(record.files)
    : record.files;

  return {
    ...record,
    files,
    status: deriveEvidenceStatus(template, {
      ...record,
      files,
    }),
  };
}

function getPhaseSummary(
  phase: CareerPhase,
  stats: {
    completed: number;
    started: number;
    total: number;
  },
  isComplete: boolean,
  isCurrent: boolean,
) {
  if (phase === "self") {
    return isComplete
      ? "Self-reported foundation complete. Your Career ID can now level up with stronger proof."
      : `${stats.completed}/${stats.total} self-reported fields are ready.`;
  }

  if (isComplete) {
    return `${phaseMeta[phase].label} trust is now live inside your Career ID.`;
  }

  if (isCurrent) {
    if (stats.started > 0) {
      return `${stats.started}/${stats.total} ${phaseMeta[phase].previewLabel} signals are in progress.`;
    }

    switch (phase) {
      case "relationship":
        return "Add at least one endorsement to unlock this phase.";
      case "document":
        return "Attach offer, employment, education, or transcript proof to unlock this phase.";
      case "signature":
        return "Add employment verification to unlock this phase.";
      case "institution":
        return "Add your driver's license verification to reach the highest trust layer.";
      default:
        return "This phase is ready for its first signal.";
    }
  }

  return "Waiting on the earlier trust layers to complete first.";
}

async function getOrCreateViewerAggregate(viewer: BuilderViewer, correlationId: string) {
  const existing = await findTalentIdentityByEmail({
    email: viewer.email,
    correlationId,
  });

  if (existing) {
    return existing;
  }

  const identityName = splitDisplayName(viewer.name, viewer.email);

  return createTalentIdentity({
    input: {
      email: viewer.email,
      firstName: identityName.firstName,
      lastName: identityName.lastName,
      countryCode: "US",
    },
    actorType: "talent_user",
    actorId: viewer.email,
    correlationId,
  });
}

async function loadWorkspaceState(viewer: BuilderViewer, correlationId: string) {
  const aggregate = await getOrCreateViewerAggregate(viewer, correlationId);
  const profile =
    (await getPersistentCareerBuilderProfile({
      careerIdentityId: aggregate.talentIdentity.id,
      soulRecordId: aggregate.soulRecord.id,
    })) ??
    createEmptyProfile({
      talentIdentityId: aggregate.talentIdentity.id,
      soulRecordId: aggregate.soulRecord.id,
      displayName: aggregate.talentIdentity.display_name,
    });
  const persistedEvidence = await listPersistentCareerBuilderEvidence({
    careerIdentityId: aggregate.talentIdentity.id,
    soulRecordId: aggregate.soulRecord.id,
  });

  return {
    aggregate,
    profile,
    persistedEvidence,
  };
}

async function buildSnapshot(
  viewer: BuilderViewer,
  correlationId: string,
): Promise<CareerBuilderSnapshotDto> {
  const { aggregate, profile, persistedEvidence } = await loadWorkspaceState(viewer, correlationId);

  // A user can own multiple evidence rows per template — one per distinct
  // credential (Acme/Engineer offer letter + Google/Manager offer letter,
  // Stanford diploma + MIT diploma, etc.). Ship them all through to the
  // client so the Career ID renders every badge, not just whichever row
  // landed last in a templateId-keyed map.
  const evidence = [
    ...persistedEvidence.map((record) => {
      const template = builderEvidenceTemplates.find((t) => t.id === record.templateId);
      return template ? normalizeEvidenceRecord(template, record) : record;
    }),
    // Templates the user hasn't started yet still need an empty
    // placeholder so the "needs upload" cards can render.
    ...builderEvidenceTemplates
      .filter((template) => !persistedEvidence.some((r) => r.templateId === template.id))
      .map((template) =>
        normalizeEvidenceRecord(
          template,
          createEmptyEvidenceRecord({
            talentIdentityId: aggregate.talentIdentity.id,
            soulRecordId: aggregate.soulRecord.id,
            template,
          }),
        ),
      ),
  ];

  const completedProfileFields = builderProfileFields.filter((field) =>
    hasProfileFieldValue(profile, field),
  ).length;
  // Template-level completion: any row under the template counts.
  const completedEvidenceCount = builderEvidenceTemplates.filter((template) =>
    evidence.some(
      (record) => record.templateId === template.id && isEvidenceComplete(template, record),
    ),
  ).length;
  const totalTasks = builderProfileFields.length + builderEvidenceTemplates.length;
  const overallProgress = Math.round(
    ((completedProfileFields + completedEvidenceCount) / totalTasks) * 100,
  );
  const selfComplete = completedProfileFields === builderProfileFields.length;
  const tierStats = Object.fromEntries(
    phaseSequence.map((phase) => {
      if (phase === "self") {
        return [
          phase,
          {
            completed: completedProfileFields,
            started: completedProfileFields,
            total: builderProfileFields.length,
          },
        ];
      }

      const phaseTemplates = builderEvidenceTemplates.filter(
        (template) => template.completionTier === phase,
      );

      return [
        phase,
        {
          completed: phaseTemplates.filter((template) =>
            evidence.some(
              (record) =>
                record.templateId === template.id && isEvidenceComplete(template, record),
            ),
          ).length,
          started: phaseTemplates.filter((template) =>
            evidence.some(
              (record) => record.templateId === template.id && isEvidenceStarted(record),
            ),
          ).length,
          total: phaseTemplates.length,
        },
      ];
    }),
  ) as Record<
    CareerPhase,
    {
      completed: number;
      started: number;
      total: number;
    }
  >;

  let strongestTier: CareerPhase = "self";

  if (selfComplete) {
    strongestTier = "self";

    for (const phase of phaseSequence.slice(1)) {
      if (tierStats[phase].completed === tierStats[phase].total) {
        strongestTier = phase;
        continue;
      }

      break;
    }
  }

  const strongestRank = selfComplete ? phaseMeta[strongestTier].rank : 0;
  const activeRank = selfComplete
    ? Math.min(strongestRank + 1, phaseSequence.length)
    : phaseMeta.self.rank;

  const phaseProgress = phaseSequence.map((phase) => {
    const rank = phaseMeta[phase].rank;
    const isComplete =
      phase === "self"
        ? selfComplete
        : selfComplete && strongestRank >= rank;
    const isCurrent = !isComplete && rank === activeRank;

    return {
      phase,
      label: phaseMeta[phase].label,
      completed: tierStats[phase].completed,
      started: tierStats[phase].started,
      total: tierStats[phase].total,
      isComplete,
      isCurrent,
      summary: getPhaseSummary(phase, tierStats[phase], isComplete, isCurrent),
    };
  });
  // Derive badges from career_builder_evidence's verification_status
  // column. One badge per (templateId, verified record). Label copy
  // differs per template but the tier logic is the same:
  //   VERIFIED → "<Type> verified"
  //   PARTIAL  → "<Type> on file"   (evidence present, trusted-source
  //                                   signal weaker or missing)
  //   FAILED   → no badge
  // The badge model only has status: "verified" — PARTIAL vs VERIFIED
  // is distinguished today by label copy; downstream renderers can read
  // the verification_status field directly if they need finer grain.
  const BADGE_TEMPLATES: Array<{
    templateId: string;
    verifiedLabel: string;
    partialLabel: string;
    idPrefix: string;
  }> = [
    {
      templateId: "offer-letters",
      verifiedLabel: "Offer letter verified",
      partialLabel: "Offer letter on file",
      idPrefix: "badge_offer_letter",
    },
    {
      templateId: "employment-history-reports",
      verifiedLabel: "Employment verified",
      partialLabel: "Employment evidence on file",
      idPrefix: "badge_employment_verification",
    },
    {
      templateId: "diplomas-degrees",
      verifiedLabel: "Education verified",
      partialLabel: "Education evidence on file",
      idPrefix: "badge_education",
    },
    {
      templateId: "transcripts",
      verifiedLabel: "Transcript verified",
      partialLabel: "Transcript on file",
      idPrefix: "badge_transcript",
    },
  ];

  const extraBadges = evidence.flatMap((record) => {
    const template = BADGE_TEMPLATES.find((t) => t.templateId === record.templateId);
    if (!template) return [];
    if (record.verificationStatus === "VERIFIED") {
      return [
        {
          id: `${template.idPrefix}_${record.id}`,
          label: template.verifiedLabel,
          phase: "document_backed" as const,
          status: "verified" as const,
        },
      ];
    }
    if (record.verificationStatus === "PARTIAL") {
      return [
        {
          id: `${template.idPrefix}_${record.id}`,
          label: template.partialLabel,
          phase: "document_backed" as const,
          status: "verified" as const,
        },
      ];
    }
    return [];
  });

  const careerIdPresentation = await getCareerIdPresentation({
    careerIdentityId: aggregate.talentIdentity.id,
    correlationId,
    phaseProgress,
    extraBadges,
  });

  const nextUploads = nextUploadPriority
    .filter((templateId) => {
      const template = builderEvidenceTemplates.find((candidate) => candidate.id === templateId)!;
      const record = evidence.find((candidate) => candidate.templateId === templateId)!;
      return !isEvidenceComplete(template, record);
    })
    .slice(0, 3)
    .map((templateId) => {
      const template = builderEvidenceTemplates.find((candidate) => candidate.id === templateId)!;
      return {
        templateId,
        title: template.title,
      };
    });

  return {
    identity: {
      talentIdentityId: aggregate.talentIdentity.id,
      talentAgentId: aggregate.talentIdentity.talent_agent_id,
      soulRecordId: aggregate.soulRecord.id,
      displayName: aggregate.talentIdentity.display_name,
      email: aggregate.talentIdentity.email,
    },
    profile,
    evidence,
    progress: {
      overallProgress,
      completedEvidenceCount,
      strongestTier,
      nextUploads,
    },
    phaseProgress,
    careerIdProfile: careerIdPresentation.careerIdProfile,
    documentVerification: careerIdPresentation.documentVerification,
  };
}

function validateDate(value: string) {
  return value === "" || !Number.isNaN(Date.parse(value));
}

function validateEvidenceSubmission(args: {
  template: BuilderEvidenceTemplate;
  value: CareerEvidenceInput;
  newFiles: SubmittedFile[];
  retainedFiles: CareerArtifactReference[];
}) {
  const errors: Record<string, string> = {};
  const hasFiles = args.retainedFiles.length + args.newFiles.length > 0;

  if (hasFiles && args.value.sourceOrIssuer.trim().length === 0) {
    errors.sourceOrIssuer = "Source / issuer is required once proof is attached.";
  }

  if (
    hasFiles &&
    args.value.issuedOn.trim().length === 0 &&
    !isDriverLicenseTemplate(args.template)
  ) {
    errors.issuedOn = "Verified or issued date is required once proof is attached.";
  }

  if (!validateDate(args.value.issuedOn)) {
    errors.issuedOn = "Enter a valid date.";
  }

  if (isDriverLicenseTemplate(args.template)) {
    const invalidFile = args.newFiles.find((item) => !item.file.type.startsWith("image/"));

    if (invalidFile) {
      errors.files = "Driver's license uploads must be images.";
    }
  }

  // Role is a general-purpose optional field at the schema layer, but for
  // offer-letters we enforce it at the domain layer — the api-gateway verifier
  // needs a role to check against the PDF content.
  if (args.template.id === "offer-letters" && (args.value.role ?? "").trim().length === 0) {
    errors.role = "Role is required for offer letters.";
  }

  return errors;
}

export async function getCareerBuilderWorkspace(args: {
  viewer: BuilderViewer;
  correlationId: string;
}) {
  return buildSnapshot(args.viewer, args.correlationId);
}

export async function saveCareerBuilderPhase(args: {
  viewer: BuilderViewer;
  phase: CareerPhase;
  input: CareerBuilderPhaseSaveInput;
  uploadsByTemplateId: Partial<Record<string, SubmittedFile[]>>;
  correlationId: string;
}): Promise<CareerBuilderSnapshotDto> {
  const parsed = careerBuilderPhaseSaveInputSchema.parse(args.input);
  const { aggregate, profile, persistedEvidence } = await loadWorkspaceState(
    args.viewer,
    args.correlationId,
  );
  // Multiple evidence rows can exist per template (one per distinct
  // (employer, role) credential). Look records up by the compound
  // identity key — not by template alone — so an incoming save for a
  // new (sourceOrIssuer, role) doesn't reuse an unrelated record's id
  // and collide on the primary key during UPSERT.
  const evidenceByIdentity = new Map(
    persistedEvidence.map(
      (record) =>
        [
          buildEvidenceIdentityKey(
            record.templateId,
            record.sourceOrIssuer,
            record.role,
          ),
          record,
        ] as const,
    ),
  );
  const fieldErrors: Record<string, Record<string, string>> = {};
  const allowedTemplateIds = new Set(builderPhaseTemplateIds[args.phase]);

  if (args.phase === "self" && parsed.profile) {
    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: aggregate.talentIdentity.id,
      soulRecordId: aggregate.soulRecord.id,
      input: parsed.profile,
    });

    logAuditEvent({
      eventType: "career_builder.profile.saved",
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      targetType: "talent_identity",
      targetId: aggregate.talentIdentity.id,
      correlationId: args.correlationId,
      metadataJson: {
        phase: args.phase,
      },
    });

    return buildSnapshot(args.viewer, args.correlationId);
  }

  for (const evidenceInput of parsed.evidence) {
    if (!allowedTemplateIds.has(evidenceInput.templateId)) {
      throw new ApiError({
        errorCode: "VALIDATION_FAILED",
        status: 422,
        message: "Evidence item does not belong to this phase.",
        details: {
          phase: args.phase,
          templateId: evidenceInput.templateId,
        },
        correlationId: args.correlationId,
      });
    }

    const template = builderEvidenceTemplates.find(
      (candidate) => candidate.id === evidenceInput.templateId,
    )!;
    const currentRecord = normalizeEvidenceRecord(
      template,
      evidenceByIdentity.get(
        buildEvidenceIdentityKey(
          template.id,
          evidenceInput.sourceOrIssuer,
          evidenceInput.role ?? "",
        ),
      ) ??
        createEmptyEvidenceRecord({
          talentIdentityId: aggregate.talentIdentity.id,
          soulRecordId: aggregate.soulRecord.id,
          template,
        }),
    );
    const retainedFiles = currentRecord.files.filter((file) =>
      evidenceInput.retainedArtifactIds.includes(file.artifactId),
    );
    const newFiles = args.uploadsByTemplateId[evidenceInput.templateId] ?? [];
    const validationErrors = validateEvidenceSubmission({
      template,
      value: evidenceInput,
      newFiles,
      retainedFiles,
    });

    if (Object.keys(validationErrors).length > 0) {
      fieldErrors[evidenceInput.templateId] = validationErrors;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiError({
      errorCode: "VALIDATION_FAILED",
      status: 422,
      message: "Phase validation failed.",
      details: {
        accept: defaultUploadAccept,
        errors: fieldErrors,
      },
      correlationId: args.correlationId,
    });
  }

  for (const evidenceInput of parsed.evidence) {
    const template = builderEvidenceTemplates.find(
      (candidate) => candidate.id === evidenceInput.templateId,
    )!;
    const currentRecord = normalizeEvidenceRecord(
      template,
      evidenceByIdentity.get(
        buildEvidenceIdentityKey(
          template.id,
          evidenceInput.sourceOrIssuer,
          evidenceInput.role ?? "",
        ),
      ) ??
        createEmptyEvidenceRecord({
          talentIdentityId: aggregate.talentIdentity.id,
          soulRecordId: aggregate.soulRecord.id,
          template,
        }),
    );
    const retainedFiles = currentRecord.files.filter((file) =>
      evidenceInput.retainedArtifactIds.includes(file.artifactId),
    );
    const submittedFiles = args.uploadsByTemplateId[evidenceInput.templateId] ?? [];
    const uploadedFiles: CareerArtifactReference[] = [];

    for (const submittedFile of submittedFiles) {
      const upload = await uploadArtifact({
        file: submittedFile.file,
        ownerTalentId: aggregate.talentIdentity.id,
        actorType: "talent_user",
        actorId: aggregate.talentIdentity.id,
        correlationId: args.correlationId,
      });

      uploadedFiles.push({
        artifactId: upload.artifact.artifact_id,
        name: upload.artifact.original_filename,
        sizeLabel: formatBytes(submittedFile.file.size),
        mimeType: upload.artifact.mime_type,
        uploadedAt: upload.artifact.uploaded_at,
        slot: submittedFile.slot,
      });
    }

    const mergedFiles = isDriverLicenseTemplate(template)
      ? orderedDriverLicenseFiles([...retainedFiles, ...uploadedFiles])
      : [...retainedFiles, ...uploadedFiles];
    const now = new Date().toISOString();
    const nextRecord = normalizeEvidenceRecord(template, {
      ...currentRecord,
      sourceOrIssuer: evidenceInput.sourceOrIssuer,
      role: evidenceInput.role ?? "",
      issuedOn: evidenceInput.issuedOn,
      validationContext: evidenceInput.validationContext,
      whyItMatters: evidenceInput.whyItMatters,
      files: mergedFiles,
      updatedAt: now,
    });

    const persisted = await upsertPersistentCareerBuilderEvidence({
      careerIdentityId: aggregate.talentIdentity.id,
      soulRecordId: aggregate.soulRecord.id,
      record: nextRecord,
    });

    evidenceByIdentity.set(
      buildEvidenceIdentityKey(
        persisted.templateId,
        persisted.sourceOrIssuer,
        persisted.role,
      ),
      persisted,
    );
  }

  logAuditEvent({
    eventType: "career_builder.phase.saved",
    actorType: "talent_user",
    actorId: aggregate.talentIdentity.id,
    targetType: "talent_identity",
    targetId: aggregate.talentIdentity.id,
    correlationId: args.correlationId,
    metadataJson: {
      phase: args.phase,
      evidenceCount: parsed.evidence.length,
    },
  });

  return buildSnapshot(args.viewer, args.correlationId);
}
