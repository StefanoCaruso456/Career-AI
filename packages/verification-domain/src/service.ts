import {
  ApiError,
  createVerificationRecordInputSchema,
  type ActorType,
  type AddProvenanceInput,
  type CreateVerificationRecordInput,
  type ProvenanceRecord,
  type VerificationConfidenceTier,
  type VerificationRecord,
  type VerificationStatus,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import {
  createPersistentProvenanceRecord,
  createPersistentVerificationRecord,
  findPersistentVerificationRecordByClaimId,
  findPersistentVerificationRecordById,
  getPersistentClaimVerificationMetrics,
  isDurableTrustStorageEnabled,
  listPersistentProvenanceRecords,
  updatePersistentVerificationRecord,
} from "@/packages/persistence/src";
import { getVerificationStore } from "./store";

const allowedTransitions: Partial<Record<VerificationStatus, VerificationStatus[]>> = {
  NOT_SUBMITTED: ["SUBMITTED"],
  SUBMITTED: ["PARSING", "PENDING_REVIEW", "PARTIALLY_VERIFIED", "REVIEWED", "REJECTED", "NEEDS_RESUBMISSION"],
  PARSING: ["PARSED", "REJECTED"],
  PARSED: ["PENDING_REVIEW", "PARTIALLY_VERIFIED", "REVIEWED", "REJECTED"],
  PENDING_REVIEW: [
    "PARTIALLY_VERIFIED",
    "REVIEWED",
    "SOURCE_VERIFIED",
    "MULTI_SOURCE_VERIFIED",
    "REJECTED",
    "NEEDS_RESUBMISSION",
  ],
  PARTIALLY_VERIFIED: ["REVIEWED", "SOURCE_VERIFIED", "MULTI_SOURCE_VERIFIED", "REJECTED", "EXPIRED"],
  REVIEWED: ["SOURCE_VERIFIED", "MULTI_SOURCE_VERIFIED", "EXPIRED", "REJECTED", "NEEDS_RESUBMISSION"],
  SOURCE_VERIFIED: ["MULTI_SOURCE_VERIFIED", "EXPIRED"],
  MULTI_SOURCE_VERIFIED: ["EXPIRED"],
  NEEDS_RESUBMISSION: ["SUBMITTED"],
};

function nextConfidenceTierForStatus(
  status: VerificationStatus,
  current: VerificationConfidenceTier,
): VerificationConfidenceTier {
  switch (status) {
    case "REVIEWED":
    case "PARTIALLY_VERIFIED":
      return "REVIEWED";
    case "SOURCE_VERIFIED":
      return "SOURCE_CONFIRMED";
    case "MULTI_SOURCE_VERIFIED":
      return "MULTI_SOURCE_CONFIRMED";
    default:
      return current;
  }
}

export function createVerificationRecord(args: {
  input: CreateVerificationRecordInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return createVerificationRecordAsync(args);
}

async function createVerificationRecordAsync(args: {
  input: CreateVerificationRecordInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}): Promise<VerificationRecord> {
  const input = createVerificationRecordInputSchema.parse(args.input);

  if (isDurableTrustStorageEnabled()) {
    const existing = await findPersistentVerificationRecordByClaimId({
      claimId: input.claimId,
    });

    if (existing) {
      throw new ApiError({
        errorCode: "CONFLICT",
        status: 409,
        message: "Claim already has a verification record.",
        details: { claimId: input.claimId },
        correlationId: args.correlationId,
      });
    }
  } else {
    const store = getVerificationStore();

    if (store.recordIdByClaimId.has(input.claimId)) {
      throw new ApiError({
        errorCode: "CONFLICT",
        status: 409,
        message: "Claim already has a verification record.",
        details: { claimId: input.claimId },
        correlationId: args.correlationId,
      });
    }
  }

  const now = new Date().toISOString();
  const record: VerificationRecord = {
    id: `ver_${crypto.randomUUID()}`,
    claim_id: input.claimId,
    status: input.status,
    confidence_tier: input.confidenceTier,
    primary_method: input.primaryMethod,
    source_label: input.sourceLabel,
    source_reference_optional: input.sourceReferenceOptional ?? null,
    reviewer_actor_id_optional: null,
    reviewed_at_optional: null,
    expires_at_optional: null,
    notes_optional: input.notesOptional ?? null,
    created_at: now,
    updated_at: now,
  };

  if (isDurableTrustStorageEnabled()) {
    await createPersistentVerificationRecord({
      record,
    });
  } else {
    const store = getVerificationStore();
    store.recordsById.set(record.id, record);
    store.recordIdByClaimId.set(record.claim_id, record.id);
    store.provenanceByVerificationId.set(record.id, []);
  }

  logAuditEvent({
    eventType: "verification.record.created",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "verification_record",
    targetId: record.id,
    correlationId: args.correlationId,
    metadataJson: {
      claim_id: record.claim_id,
      status: record.status,
    },
  });

  return record;
}

export function getVerificationRecord(args: {
  verificationRecordId: string;
  correlationId: string;
}) {
  return getVerificationRecordAsync(args);
}

async function getVerificationRecordAsync(args: {
  verificationRecordId: string;
  correlationId: string;
}): Promise<VerificationRecord> {
  if (isDurableTrustStorageEnabled()) {
    const record = await findPersistentVerificationRecordById({
      verificationRecordId: args.verificationRecordId,
    });

    if (!record) {
      throw new ApiError({
        errorCode: "NOT_FOUND",
        status: 404,
        message: "Verification record was not found.",
        details: { verificationRecordId: args.verificationRecordId },
        correlationId: args.correlationId,
      });
    }

    return record;
  }

  const record = getVerificationStore().recordsById.get(args.verificationRecordId);

  if (!record) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Verification record was not found.",
      details: { verificationRecordId: args.verificationRecordId },
      correlationId: args.correlationId,
    });
  }

  return record;
}

export function getVerificationRecordForClaim(args: {
  claimId: string;
  correlationId: string;
}) {
  return getVerificationRecordForClaimAsync(args);
}

export function markEvidenceSubmittedForClaim(args: {
  claimId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return markEvidenceSubmittedForClaimAsync(args);
}

async function getVerificationRecordForClaimAsync(args: {
  claimId: string;
  correlationId: string;
}): Promise<VerificationRecord> {
  if (isDurableTrustStorageEnabled()) {
    const record = await findPersistentVerificationRecordByClaimId({
      claimId: args.claimId,
    });

    if (!record) {
      throw new ApiError({
        errorCode: "NOT_FOUND",
        status: 404,
        message: "Verification record for claim was not found.",
        details: { claimId: args.claimId },
        correlationId: args.correlationId,
      });
    }

    return record;
  }

  const store = getVerificationStore();
  const recordId = store.recordIdByClaimId.get(args.claimId);

  if (!recordId) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Verification record for claim was not found.",
      details: { claimId: args.claimId },
      correlationId: args.correlationId,
    });
  }

  return getVerificationRecord({
    verificationRecordId: recordId,
    correlationId: args.correlationId,
  });
}

async function markEvidenceSubmittedForClaimAsync(args: {
  claimId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const record = await getVerificationRecordForClaim({
    claimId: args.claimId,
    correlationId: args.correlationId,
  });

  const updatedRecord: VerificationRecord = {
    ...record,
    confidence_tier:
      record.confidence_tier === "SELF_REPORTED" ? "EVIDENCE_SUBMITTED" : record.confidence_tier,
    updated_at: new Date().toISOString(),
  };

  if (isDurableTrustStorageEnabled()) {
    await updatePersistentVerificationRecord({
      record: updatedRecord,
    });
  } else {
    const store = getVerificationStore();
    store.recordsById.set(updatedRecord.id, updatedRecord);
  }

  logAuditEvent({
    eventType: "verification.evidence.submitted",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "verification_record",
    targetId: updatedRecord.id,
    correlationId: args.correlationId,
    metadataJson: {
      claim_id: args.claimId,
      confidence_tier: updatedRecord.confidence_tier,
    },
  });

  return updatedRecord;
}

export function transitionVerificationRecord(args: {
  verificationRecordId: string;
  targetStatus: VerificationStatus;
  reason: string;
  reviewerActorId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return transitionVerificationRecordAsync(args);
}

async function transitionVerificationRecordAsync(args: {
  verificationRecordId: string;
  targetStatus: VerificationStatus;
  reason: string;
  reviewerActorId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}): Promise<VerificationRecord> {
  const current = await getVerificationRecord({
    verificationRecordId: args.verificationRecordId,
    correlationId: args.correlationId,
  });
  const permittedTransitions = allowedTransitions[current.status] ?? [];

  if (!permittedTransitions.includes(args.targetStatus)) {
    throw new ApiError({
      errorCode: "VALIDATION_FAILED",
      status: 422,
      message: `Cannot transition from ${current.status} to ${args.targetStatus}.`,
      details: {
        currentStatus: current.status,
        targetStatus: args.targetStatus,
      },
      correlationId: args.correlationId,
    });
  }

  const updatedRecord: VerificationRecord = {
    ...current,
    status: args.targetStatus,
    confidence_tier: nextConfidenceTierForStatus(args.targetStatus, current.confidence_tier),
    reviewer_actor_id_optional: args.reviewerActorId,
    reviewed_at_optional: new Date().toISOString(),
    notes_optional: args.reason,
    updated_at: new Date().toISOString(),
  };

  if (isDurableTrustStorageEnabled()) {
    await updatePersistentVerificationRecord({
      record: updatedRecord,
    });
  } else {
    const store = getVerificationStore();
    store.recordsById.set(updatedRecord.id, updatedRecord);
  }

  logAuditEvent({
    eventType: "verification.status.changed",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "verification_record",
    targetId: updatedRecord.id,
    correlationId: args.correlationId,
    metadataJson: {
      from_status: current.status,
      to_status: updatedRecord.status,
      reason: args.reason,
    },
  });

  if (args.targetStatus === "REJECTED") {
    logAuditEvent({
      eventType: "verification.review.rejected",
      actorType: args.actorType,
      actorId: args.actorId,
      targetType: "verification_record",
      targetId: updatedRecord.id,
      correlationId: args.correlationId,
      metadataJson: {
        reason: args.reason,
      },
    });
  } else if (args.targetStatus === "NEEDS_RESUBMISSION") {
    logAuditEvent({
      eventType: "verification.review.needs_resubmission",
      actorType: args.actorType,
      actorId: args.actorId,
      targetType: "verification_record",
      targetId: updatedRecord.id,
      correlationId: args.correlationId,
      metadataJson: {
        reason: args.reason,
      },
    });
  } else if (
    ["PARTIALLY_VERIFIED", "REVIEWED", "SOURCE_VERIFIED", "MULTI_SOURCE_VERIFIED"].includes(
      args.targetStatus,
    )
  ) {
    logAuditEvent({
      eventType: "verification.review.approved",
      actorType: args.actorType,
      actorId: args.actorId,
      targetType: "verification_record",
      targetId: updatedRecord.id,
      correlationId: args.correlationId,
      metadataJson: {
        target_status: args.targetStatus,
        reason: args.reason,
      },
    });
  }

  return updatedRecord;
}

export function addProvenanceRecord(args: {
  verificationRecordId: string;
  input: AddProvenanceInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return addProvenanceRecordAsync(args);
}

async function addProvenanceRecordAsync(args: {
  verificationRecordId: string;
  input: AddProvenanceInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}): Promise<ProvenanceRecord> {
  await getVerificationRecord({
    verificationRecordId: args.verificationRecordId,
    correlationId: args.correlationId,
  });

  const provenanceRecord: ProvenanceRecord = {
    id: `prov_${crypto.randomUUID()}`,
    verification_record_id: args.verificationRecordId,
    artifact_id_optional: args.input.artifactIdOptional ?? null,
    source_actor_type: args.input.sourceActorType,
    source_actor_id_optional: args.input.sourceActorIdOptional ?? null,
    source_method: args.input.sourceMethod,
    source_details_json: args.input.sourceDetails,
    created_at: new Date().toISOString(),
  };

  if (isDurableTrustStorageEnabled()) {
    await createPersistentProvenanceRecord({
      record: provenanceRecord,
    });
  } else {
    const store = getVerificationStore();
    const records = store.provenanceByVerificationId.get(args.verificationRecordId) ?? [];
    store.provenanceByVerificationId.set(args.verificationRecordId, [...records, provenanceRecord]);
  }

  logAuditEvent({
    eventType: "verification.provenance.attached",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "verification_record",
    targetId: args.verificationRecordId,
    correlationId: args.correlationId,
    metadataJson: {
      provenance_id: provenanceRecord.id,
      source_method: provenanceRecord.source_method,
    },
  });

  return provenanceRecord;
}

export function rejectVerificationRecord(args: {
  verificationRecordId: string;
  reason: string;
  reviewerActorId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return transitionVerificationRecord({
    verificationRecordId: args.verificationRecordId,
    targetStatus: "REJECTED",
    reason: args.reason,
    reviewerActorId: args.reviewerActorId,
    actorType: args.actorType,
    actorId: args.actorId,
    correlationId: args.correlationId,
  });
}

export function listProvenanceRecords(args: {
  verificationRecordId: string;
}) {
  return listProvenanceRecordsAsync(args);
}

async function listProvenanceRecordsAsync(args: {
  verificationRecordId: string;
}) {
  if (isDurableTrustStorageEnabled()) {
    return listPersistentProvenanceRecords({
      verificationRecordId: args.verificationRecordId,
    });
  }

  return [...(getVerificationStore().provenanceByVerificationId.get(args.verificationRecordId) ?? [])];
}

export function getVerificationServiceMetrics() {
  return getVerificationServiceMetricsAsync();
}

async function getVerificationServiceMetricsAsync() {
  if (isDurableTrustStorageEnabled()) {
    const metrics = await getPersistentClaimVerificationMetrics();

    return {
      verificationRecords: metrics.verificationRecords,
      provenanceEntries: metrics.provenanceEntries,
    };
  }

  const store = getVerificationStore();

  return {
    verificationRecords: store.recordsById.size,
    provenanceEntries: [...store.provenanceByVerificationId.values()].reduce(
      (total, current) => total + current.length,
      0,
    ),
  };
}
