import {
  ApiError,
  createEmploymentClaimInputSchema,
  type ActorType,
  type Claim,
  type ClaimDetailsDto,
  type CreateEmploymentClaimInput,
  type EmploymentRecord,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { listArtifactsForClaim } from "@/packages/artifact-domain/src";
import { getTalentIdentityBySoulRecordId } from "@/packages/identity-domain/src";
import {
  createVerificationRecord,
  getVerificationRecordForClaim,
  markEvidenceSubmittedForClaim,
} from "@/packages/verification-domain/src";
import { getCredentialStore } from "./store";

export function createEmploymentClaim(args: {
  input: CreateEmploymentClaimInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const input = createEmploymentClaimInputSchema.parse(args.input);
  const owner = getTalentIdentityBySoulRecordId({
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

  const verificationRecord = createVerificationRecord({
    input: {
      claimId: claim.id,
      status: "SUBMITTED",
      confidenceTier: "SELF_REPORTED",
      primaryMethod: "USER_UPLOAD",
      sourceLabel: "candidate_self_report",
    },
    actorType: args.actorType,
    actorId: args.actorId,
    correlationId: args.correlationId,
  });

  claim.current_verification_record_id = verificationRecord.id;

  const store = getCredentialStore();
  store.claimsById.set(claim.id, claim);
  store.employmentRecordsByClaimId.set(claim.id, employmentRecord);

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

  return {
    claim,
    employmentRecord,
    verificationRecord,
  };
}

export function getClaimDetails(args: {
  claimId: string;
  correlationId: string;
}): ClaimDetailsDto {
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

  const verification = getVerificationRecordForClaim({
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
}): Claim {
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
}): ClaimDetailsDto[] {
  const claims = [...getCredentialStore().claimsById.values()].filter((claim) =>
    args.soulRecordIdOptional ? claim.soul_record_id === args.soulRecordIdOptional : true,
  );

  return claims.map((claim) =>
    getClaimDetails({
      claimId: claim.id,
      correlationId: args.correlationId,
    }),
  );
}

export function attachArtifactToEmploymentClaim(args: {
  claimId: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const details = getClaimDetails({
    claimId: args.claimId,
    correlationId: args.correlationId,
  });

  const verificationRecord = markEvidenceSubmittedForClaim({
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

  return getTalentIdentityBySoulRecordId({
    soulRecordId: claim.soul_record_id,
    correlationId: args.correlationId,
  }).talentIdentity.id;
}

export function getCredentialServiceMetrics() {
  const store = getCredentialStore();

  return {
    claims: store.claimsById.size,
    employmentRecords: store.employmentRecordsByClaimId.size,
  };
}
