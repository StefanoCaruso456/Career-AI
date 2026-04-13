import {
  ApiError,
  createEmploymentClaimInputSchema,
  type ActorType,
  type Claim,
  type ClaimDetailsDto,
  type CreateEmploymentClaimInput,
  type EmploymentRecord,
  type VerificationRecord,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { listArtifactsForClaim } from "@/packages/artifact-domain/src";
import { getTalentIdentityBySoulRecordId } from "@/packages/identity-domain/src";
import {
  createPersistentEmploymentClaimRecord,
  findPersistentClaim,
  findPersistentClaimDetails,
  getPersistentClaimVerificationMetrics,
  isDurableTrustStorageEnabled,
  listPersistentClaimDetails,
} from "@/packages/persistence/src";
import {
  markEvidenceSubmittedForClaim,
} from "@/packages/verification-domain/src";
import { getVerificationStore } from "@/packages/verification-domain/src/store";
import { getCredentialStore } from "./store";

export function createEmploymentClaim(args: {
  input: CreateEmploymentClaimInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return createEmploymentClaimAsync(args);
}

async function createEmploymentClaimAsync(args: {
  input: CreateEmploymentClaimInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const input = createEmploymentClaimInputSchema.parse(args.input);
  const owner = await getTalentIdentityBySoulRecordId({
    soulRecordId: input.soulRecordId,
    correlationId: args.correlationId,
  });

  const now = new Date().toISOString();
  const claim: Claim = {
    id: `claim_${crypto.randomUUID()}`,
    soul_record_id: input.soulRecordId,
    claim_type: "EMPLOYMENT",
    title: `${input.roleTitle} at ${input.employerName}`,
    summary: `${input.employerName} employment from ${input.startDate}${
      input.endDate ? ` to ${input.endDate}` : ""
    }`,
    self_reported_payload_json: {
      employerName: input.employerName,
      roleTitle: input.roleTitle,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      currentlyEmployed: input.currentlyEmployed,
    },
    current_verification_record_id: "",
    created_at: now,
    updated_at: now,
  };

  const employmentRecord: EmploymentRecord = {
    id: `emp_${crypto.randomUUID()}`,
    claim_id: claim.id,
    employer_name: input.employerName,
    employer_domain_optional: input.employerDomainOptional ?? null,
    role_title: input.roleTitle,
    employment_type_optional: input.employmentTypeOptional ?? null,
    start_date: input.startDate,
    end_date_optional: input.endDate ?? null,
    currently_employed: input.currentlyEmployed,
    location_optional: input.locationOptional ?? null,
    signatory_name_optional: input.signatoryNameOptional ?? null,
    signatory_title_optional: input.signatoryTitleOptional ?? null,
    company_letterhead_detected_optional: input.companyLetterheadDetectedOptional ?? null,
    document_date_optional: input.documentDateOptional ?? null,
    created_at: now,
    updated_at: now,
  };

  const verificationRecord: VerificationRecord = {
    id: `ver_${crypto.randomUUID()}`,
    claim_id: claim.id,
    status: "SUBMITTED",
    confidence_tier: "SELF_REPORTED",
    primary_method: "USER_UPLOAD",
    source_label: "candidate_self_report",
    source_reference_optional: null,
    reviewer_actor_id_optional: null,
    reviewed_at_optional: null,
    expires_at_optional: null,
    notes_optional: null,
    created_at: now,
    updated_at: now,
  };

  claim.current_verification_record_id = verificationRecord.id;

  if (isDurableTrustStorageEnabled()) {
    await createPersistentEmploymentClaimRecord({
      claim,
      employmentRecord,
      verificationRecord,
    });
  } else {
    const store = getCredentialStore();
    store.claimsById.set(claim.id, claim);
    store.employmentRecordsByClaimId.set(claim.id, employmentRecord);

    const verificationStore = getVerificationStore();
    verificationStore.recordsById.set(verificationRecord.id, verificationRecord);
    verificationStore.recordIdByClaimId.set(claim.id, verificationRecord.id);
    verificationStore.provenanceByVerificationId.set(verificationRecord.id, []);
  }

  logAuditEvent({
    eventType: "claim.created",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "claim",
    targetId: claim.id,
    correlationId: args.correlationId,
    metadataJson: {
      claim_type: claim.claim_type,
      soul_record_id: claim.soul_record_id,
      talent_identity_id: owner.talentIdentity.id,
    },
  });
  logAuditEvent({
    eventType: "verification.record.created",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "verification_record",
    targetId: verificationRecord.id,
    correlationId: args.correlationId,
    metadataJson: {
      claim_id: verificationRecord.claim_id,
      status: verificationRecord.status,
    },
  });

  return {
    claim,
    employmentRecord,
    verificationRecord,
  };
}

export function getClaimDetails(args: {
  claimId: string;
  correlationId: string;
}) {
  return getClaimDetailsAsync(args);
}

async function getClaimDetailsAsync(args: {
  claimId: string;
  correlationId: string;
}): Promise<ClaimDetailsDto> {
  if (isDurableTrustStorageEnabled()) {
    const details = await findPersistentClaimDetails({
      claimId: args.claimId,
    });

    if (!details) {
      throw new ApiError({
        errorCode: "NOT_FOUND",
        status: 404,
        message: "Claim was not found.",
        details: { claimId: args.claimId },
        correlationId: args.correlationId,
      });
    }

    return {
      ...details,
      artifactIds: listArtifactsForClaim(args.claimId),
    };
  }

  const store = getCredentialStore();
  const claim = store.claimsById.get(args.claimId);
  const employmentRecord = store.employmentRecordsByClaimId.get(args.claimId);

  if (!claim || !employmentRecord) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Claim was not found.",
      details: { claimId: args.claimId },
      correlationId: args.correlationId,
    });
  }

  const { getVerificationRecordForClaim } = await import("@/packages/verification-domain/src");
  const verification = await getVerificationRecordForClaim({
    claimId: claim.id,
    correlationId: args.correlationId,
  });

  return {
    claimId: claim.id,
    claimType: "EMPLOYMENT",
    title: claim.title,
    summary: claim.summary,
    verification,
    employmentRecord,
    artifactIds: listArtifactsForClaim(claim.id),
    createdAt: claim.created_at,
    updatedAt: claim.updated_at,
  };
}

export function getClaim(args: {
  claimId: string;
  correlationId: string;
}) {
  return getClaimAsync(args);
}

async function getClaimAsync(args: {
  claimId: string;
  correlationId: string;
}): Promise<Claim> {
  if (isDurableTrustStorageEnabled()) {
    const claim = await findPersistentClaim({
      claimId: args.claimId,
    });

    if (!claim) {
      throw new ApiError({
        errorCode: "NOT_FOUND",
        status: 404,
        message: "Claim was not found.",
        details: { claimId: args.claimId },
        correlationId: args.correlationId,
      });
    }

    return claim;
  }

  const claim = getCredentialStore().claimsById.get(args.claimId);

  if (!claim) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Claim was not found.",
      details: { claimId: args.claimId },
      correlationId: args.correlationId,
    });
  }

  return claim;
}

export function listClaimDetails(args: {
  correlationId: string;
  soulRecordIdOptional?: string;
}) {
  return listClaimDetailsAsync(args);
}

async function listClaimDetailsAsync(args: {
  correlationId: string;
  soulRecordIdOptional?: string;
}): Promise<ClaimDetailsDto[]> {
  if (isDurableTrustStorageEnabled()) {
    const details = await listPersistentClaimDetails({
      soulRecordIdOptional: args.soulRecordIdOptional,
    });

    return details.map((detail) => ({
      ...detail,
      artifactIds: listArtifactsForClaim(detail.claimId),
    }));
  }

  const claims = [...getCredentialStore().claimsById.values()].filter((claim) =>
    args.soulRecordIdOptional ? claim.soul_record_id === args.soulRecordIdOptional : true,
  );

  return Promise.all(
    claims.map((claim) =>
      getClaimDetails({
        claimId: claim.id,
        correlationId: args.correlationId,
      }),
    ),
  );
}

export function attachArtifactToEmploymentClaim(args: {
  claimId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return attachArtifactToEmploymentClaimAsync(args);
}

async function attachArtifactToEmploymentClaimAsync(args: {
  claimId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const details = await getClaimDetails({
    claimId: args.claimId,
    correlationId: args.correlationId,
  });

  const verificationRecord = await markEvidenceSubmittedForClaim({
    claimId: args.claimId,
    actorType: args.actorType,
    actorId: args.actorId,
    correlationId: args.correlationId,
  });

  return {
    ...details,
    verification: verificationRecord,
  };
}

export function getClaimOwnerIdentityId(args: {
  claimId: string;
  correlationId: string;
}) {
  return getClaimOwnerIdentityIdAsync(args);
}

async function getClaimOwnerIdentityIdAsync(args: {
  claimId: string;
  correlationId: string;
}) {
  const claim = await getClaim({
    claimId: args.claimId,
    correlationId: args.correlationId,
  });

  return (
    await getTalentIdentityBySoulRecordId({
      soulRecordId: claim.soul_record_id,
      correlationId: args.correlationId,
    })
  ).talentIdentity.id;
}

export function getCredentialServiceMetrics() {
  return getCredentialServiceMetricsAsync();
}

async function getCredentialServiceMetricsAsync() {
  if (isDurableTrustStorageEnabled()) {
    const metrics = await getPersistentClaimVerificationMetrics();

    return {
      claims: metrics.claims,
      employmentRecords: metrics.employmentRecords,
    };
  }

  const store = getCredentialStore();

  return {
    claims: store.claimsById.size,
    employmentRecords: store.employmentRecordsByClaimId.size,
  };
}
