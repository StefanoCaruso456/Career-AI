import {
  ApiError,
  generateShareProfileInputSchema,
  generateShareQrInputSchema,
  type ActorType,
  type GenerateShareProfileInput,
  type GenerateShareQrInput,
  type RecruiterEmploymentRecordView,
  type RecruiterTrustProfile,
  type RecruiterTrustProfileDto,
  type ShareProfileQrDto,
  type TrustSummary,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { listClaimDetails } from "@/packages/credential-domain/src";
import {
  getTalentIdentity,
  updateSoulRecordReferences,
} from "@/packages/identity-domain/src";
import { getRecruiterReadModelStore } from "./store";

const verifiedStatuses = new Set(["SOURCE_VERIFIED", "MULTI_SOURCE_VERIFIED"]);
const reviewedStatuses = new Set(["PARTIALLY_VERIFIED", "REVIEWED"]);
const verificationLikeStatuses = new Set([
  "PARTIALLY_VERIFIED",
  "REVIEWED",
  "SOURCE_VERIFIED",
  "MULTI_SOURCE_VERIFIED",
]);

function resolveBaseUrl(baseUrlOptional?: string) {
  return baseUrlOptional ?? "https://taid.local";
}

function buildShareUrl(baseUrlOptional: string | undefined, publicShareToken: string) {
  return new URL(`/share/${publicShareToken}`, resolveBaseUrl(baseUrlOptional)).toString();
}

function toEmploymentView(args: {
  details: ReturnType<typeof listClaimDetails>[number];
  showStatusLabels: boolean;
}): RecruiterEmploymentRecordView {
  return {
    claim_id: args.details.claimId,
    employer_name: args.details.employmentRecord.employer_name,
    role_title: args.details.employmentRecord.role_title,
    start_date: args.details.employmentRecord.start_date,
    end_date_optional: args.details.employmentRecord.end_date_optional,
    currently_employed: args.details.employmentRecord.currently_employed,
    verification_status_optional: args.showStatusLabels
      ? args.details.verification.status
      : null,
    confidence_tier_optional: args.showStatusLabels
      ? args.details.verification.confidence_tier
      : null,
    source_label_optional: args.showStatusLabels
      ? args.details.verification.source_label
      : null,
    artifact_count: args.details.artifactIds.length,
    last_updated_at: args.details.verification.updated_at,
  };
}

function buildTrustSummary(args: {
  soulRecordId: string;
  claimDetails: ReturnType<typeof listClaimDetails>;
  trustSummaryIdOptional?: string;
}): TrustSummary {
  const generatedAt = new Date().toISOString();
  const verificationRecords = args.claimDetails.map((details) => details.verification);
  const lastVerifiedRecord = verificationRecords
    .filter((record) => verificationLikeStatuses.has(record.status))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];

  return {
    id: args.trustSummaryIdOptional ?? `trust_${crypto.randomUUID()}`,
    soul_record_id: args.soulRecordId,
    total_claims: args.claimDetails.length,
    total_verified_claims: verificationRecords.filter((record) =>
      verifiedStatuses.has(record.status),
    ).length,
    total_reviewed_claims: verificationRecords.filter((record) =>
      reviewedStatuses.has(record.status),
    ).length,
    total_rejected_claims: verificationRecords.filter(
      (record) => record.status === "REJECTED",
    ).length,
    employment_verification_count: verificationRecords.filter((record) =>
      verificationLikeStatuses.has(record.status),
    ).length,
    education_verification_count: 0,
    certification_verification_count: 0,
    endorsement_count: 0,
    last_verified_at_optional: lastVerifiedRecord?.updated_at ?? null,
    generated_at: generatedAt,
  };
}

function refreshRecruiterTrustProfileProjection(args: {
  profile: RecruiterTrustProfile;
  correlationId: string;
}) {
  const aggregate = getTalentIdentity({
    talentIdentityId: args.profile.talent_identity_id,
    correlationId: args.correlationId,
  });
  const claimDetails = listClaimDetails({
    correlationId: args.correlationId,
    soulRecordIdOptional: aggregate.soulRecord.id,
  });
  const refreshedProfile: RecruiterTrustProfile = {
    ...args.profile,
    trust_summary_json: buildTrustSummary({
      soulRecordId: aggregate.soulRecord.id,
      claimDetails,
      trustSummaryIdOptional: args.profile.trust_summary_json.id,
    }),
    visible_employment_records_json: aggregate.privacySettings.show_employment_records
      ? claimDetails.map((details) =>
          toEmploymentView({
            details,
            showStatusLabels: aggregate.privacySettings.show_status_labels,
          }),
        )
      : [],
    visible_education_records_json: [],
    visible_certification_records_json: [],
    visible_endorsements_json: [],
    generated_at: new Date().toISOString(),
  };
  const store = getRecruiterReadModelStore();

  store.trustSummariesById.set(
    refreshedProfile.trust_summary_json.id,
    refreshedProfile.trust_summary_json,
  );
  store.profilesById.set(refreshedProfile.id, refreshedProfile);

  return {
    aggregate,
    profile: refreshedProfile,
  };
}

function toRecruiterTrustProfileDto(args: {
  profile: RecruiterTrustProfile;
  talentIdentity: ReturnType<typeof getTalentIdentity>["talentIdentity"];
  baseUrlOptional?: string;
}): RecruiterTrustProfileDto {
  return {
    id: args.profile.id,
    publicShareToken: args.profile.public_share_token,
    shareUrl: buildShareUrl(args.baseUrlOptional, args.profile.public_share_token),
    candidate: {
      id: args.talentIdentity.id,
      talentAgentId: args.talentIdentity.talent_agent_id,
      displayName: args.talentIdentity.display_name,
    },
    trustSummary: {
      id: args.profile.trust_summary_json.id,
      totalClaims: args.profile.trust_summary_json.total_claims,
      totalVerifiedClaims: args.profile.trust_summary_json.total_verified_claims,
      totalReviewedClaims: args.profile.trust_summary_json.total_reviewed_claims,
      totalRejectedClaims: args.profile.trust_summary_json.total_rejected_claims,
      employmentVerificationCount:
        args.profile.trust_summary_json.employment_verification_count,
      educationVerificationCount:
        args.profile.trust_summary_json.education_verification_count,
      certificationVerificationCount:
        args.profile.trust_summary_json.certification_verification_count,
      endorsementCount: args.profile.trust_summary_json.endorsement_count,
      lastVerifiedAtOptional: args.profile.trust_summary_json.last_verified_at_optional,
      generatedAt: args.profile.trust_summary_json.generated_at,
    },
    visibleEmploymentRecords: args.profile.visible_employment_records_json.map((record) => ({
      claimId: record.claim_id,
      employerName: record.employer_name,
      roleTitle: record.role_title,
      startDate: record.start_date,
      endDateOptional: record.end_date_optional,
      currentlyEmployed: record.currently_employed,
      verificationStatusOptional: record.verification_status_optional,
      confidenceTierOptional: record.confidence_tier_optional,
      sourceLabelOptional: record.source_label_optional,
      artifactCount: record.artifact_count,
      lastUpdatedAt: record.last_updated_at,
    })),
    visibleEducationRecords: args.profile.visible_education_records_json,
    visibleCertificationRecords: args.profile.visible_certification_records_json,
    visibleEndorsements: args.profile.visible_endorsements_json,
    generatedAt: args.profile.generated_at,
    expiresAtOptional: args.profile.expires_at_optional,
  };
}

function requireProfileById(args: { profileId: string; correlationId: string }) {
  const profile = getRecruiterReadModelStore().profilesById.get(args.profileId);

  if (!profile) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Share profile was not found.",
      details: { profileId: args.profileId },
      correlationId: args.correlationId,
    });
  }

  return profile;
}

export function generateRecruiterTrustProfile(args: {
  input: GenerateShareProfileInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}): RecruiterTrustProfileDto {
  const input = generateShareProfileInputSchema.parse(args.input);
  const aggregate = getTalentIdentity({
    talentIdentityId: input.talentIdentityId,
    correlationId: args.correlationId,
  });

  if (!aggregate.privacySettings.allow_public_share_link) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Public share links are disabled for this talent identity.",
      details: { talentIdentityId: input.talentIdentityId },
      correlationId: args.correlationId,
    });
  }

  const claimDetails = listClaimDetails({
    correlationId: args.correlationId,
    soulRecordIdOptional: aggregate.soulRecord.id,
  });

  const trustSummary = buildTrustSummary({
    soulRecordId: aggregate.soulRecord.id,
    claimDetails,
  });
  const generatedAt = new Date().toISOString();
  const profile: RecruiterTrustProfile = {
    id: `share_${crypto.randomUUID()}`,
    talent_identity_id: aggregate.talentIdentity.id,
    public_share_token: crypto.randomUUID(),
    trust_summary_json: trustSummary,
    visible_employment_records_json: aggregate.privacySettings.show_employment_records
      ? claimDetails.map((details) =>
          toEmploymentView({
            details,
            showStatusLabels: aggregate.privacySettings.show_status_labels,
          }),
        )
      : [],
    visible_education_records_json: [],
    visible_certification_records_json: [],
    visible_endorsements_json: [],
    generated_at: generatedAt,
    expires_at_optional: input.expiresAtOptional ?? null,
  };

  const store = getRecruiterReadModelStore();
  store.trustSummariesById.set(trustSummary.id, trustSummary);
  store.profilesById.set(profile.id, profile);
  store.profileIdByToken.set(profile.public_share_token, profile.id);

  updateSoulRecordReferences({
    talentIdentityId: aggregate.talentIdentity.id,
    trustSummaryIdOptional: trustSummary.id,
    defaultShareProfileIdOptional: profile.id,
    actorType: args.actorType,
    actorId: args.actorId,
    correlationId: args.correlationId,
  });

  logAuditEvent({
    eventType: "recruiter.share_profile.generated",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "share_profile",
    targetId: profile.id,
    correlationId: args.correlationId,
    metadataJson: {
      talent_identity_id: aggregate.talentIdentity.id,
      public_share_token: profile.public_share_token,
      expires_at: profile.expires_at_optional,
    },
  });

  return toRecruiterTrustProfileDto({
    profile,
    talentIdentity: aggregate.talentIdentity,
    baseUrlOptional: input.baseUrlOptional,
  });
}

export function getRecruiterTrustProfileByToken(args: {
  token: string;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
  baseUrlOptional?: string;
}) {
  const store = getRecruiterReadModelStore();
  const profileId = store.profileIdByToken.get(args.token);

  if (!profileId) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Share profile token was not found.",
      details: { token: args.token },
      correlationId: args.correlationId,
    });
  }

  const profile = requireProfileById({
    profileId,
    correlationId: args.correlationId,
  });

  if (profile.expires_at_optional && profile.expires_at_optional < new Date().toISOString()) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Share profile has expired.",
      details: { token: args.token },
      correlationId: args.correlationId,
    });
  }

  const refreshed = refreshRecruiterTrustProfileProjection({
    profile,
    correlationId: args.correlationId,
  });

  logAuditEvent({
    eventType: "recruiter.share_profile.viewed",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "share_profile",
    targetId: refreshed.profile.id,
    correlationId: args.correlationId,
    metadataJson: {
      talent_identity_id: refreshed.aggregate.talentIdentity.id,
      public_share_token: refreshed.profile.public_share_token,
    },
  });

  return toRecruiterTrustProfileDto({
    profile: refreshed.profile,
    talentIdentity: refreshed.aggregate.talentIdentity,
    baseUrlOptional: args.baseUrlOptional,
  });
}

export function generateShareProfileQr(args: {
  profileId: string;
  input: GenerateShareQrInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}): ShareProfileQrDto {
  const input = generateShareQrInputSchema.parse(args.input);
  const profile = requireProfileById({
    profileId: args.profileId,
    correlationId: args.correlationId,
  });
  const aggregate = getTalentIdentity({
    talentIdentityId: profile.talent_identity_id,
    correlationId: args.correlationId,
  });

  if (!aggregate.privacySettings.allow_qr_share) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "QR sharing is disabled for this talent identity.",
      details: { talentIdentityId: aggregate.talentIdentity.id },
      correlationId: args.correlationId,
    });
  }

  const shareUrl = buildShareUrl(input.baseUrlOptional, profile.public_share_token);

  logAuditEvent({
    eventType: "recruiter.share_profile.qr.generated",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "share_profile",
    targetId: profile.id,
    correlationId: args.correlationId,
    metadataJson: {
      share_url: shareUrl,
    },
  });

  return {
    profileId: profile.id,
    qrPayload: shareUrl,
    shareUrl,
  };
}

export function getShareProfileOwnerIdentityId(args: {
  profileId: string;
  correlationId: string;
}) {
  return requireProfileById(args).talent_identity_id;
}

export function getRecruiterReadModelMetrics() {
  const store = getRecruiterReadModelStore();

  return {
    shareProfiles: store.profilesById.size,
    trustSummaries: store.trustSummariesById.size,
  };
}
