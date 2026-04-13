import type { AuthenticatedActor } from "@/packages/audit-security/src";
import {
  createAccessRequestReviewTokenRecord,
  findAccessRequestReviewTokenRecordByHash,
  findAccessRequestProductRecordById,
  findActiveAccessGrant,
  findActiveAccessRequestReviewTokenRecord,
  getCandidateNotificationPreferencesRecord,
  invalidateAccessRequestReviewTokens,
  listAccessRequestProductRecordsForRequester,
  listAccessRequestProductRecordsForSubject,
  listOrganizationMembershipsForUser,
  markAccessRequestReviewTokenResolved,
  markAccessRequestReviewTokenViewed,
  updateCandidateNotificationPreferencesRecord,
  findPersistentContextByTalentIdentityId,
  getPersistentCareerBuilderProfile,
  listPersistentCareerBuilderEvidence,
  type AccessRequestProductRecord,
} from "@/packages/persistence/src";
import {
  ApiError,
  accessRequestListResponseDtoSchema,
  accessRequestReviewDtoSchema,
  candidateNotificationPreferencesSchema,
  recruiterPrivateCandidateProfileDtoSchema,
  type AccessRequestListResponseDto,
  type AccessRequestReviewDto,
  type AccessRequestSummaryDto,
  type CandidateNotificationPreferences,
  type RecruiterPrivateCandidateProfileDto,
  type UpdateCandidateNotificationPreferencesInput,
} from "@/packages/contracts/src";
import {
  grantScopedAccessRequest,
  hasScopedCandidateAccess,
  logAuditEvent,
  rejectScopedAccessRequest,
  revokeScopedAccessGrant,
} from "@/packages/audit-security/src";
import { listClaimDetails } from "@/packages/credential-domain/src";
import { hashAccessRequestReviewToken } from "@/lib/access-request-review-tokens";

type ReviewAccessResult = {
  actor: AuthenticatedActor;
  channel: "email" | "session_owner" | "sms";
  tokenId: string | null;
  tokenValidated: boolean;
};

function getRequestedDurationDays(metadataJson: Record<string, unknown>) {
  const rawValue = metadataJson.requested_duration_days;

  if (typeof rawValue === "number" && Number.isInteger(rawValue) && rawValue > 0) {
    return rawValue;
  }

  return null;
}

function toReviewPath(requestId: string) {
  return `/access-requests/${requestId}`;
}

function toSummaryDto(record: AccessRequestProductRecord): AccessRequestSummaryDto {
  return {
    createdAt: record.createdAt,
    grantIdOptional: record.grantIdOptional,
    grantLifecycleStatusOptional: record.grantLifecycleStatusOptional,
    grantRevokedAtOptional: record.grantRevokedAtOptional,
    grantedAt: record.grantedAt,
    grantedExpiresAtOptional: record.grantedExpiresAtOptional,
    id: record.id,
    justification: record.justification,
    rejectedAt: record.rejectedAt,
    requestedDurationDaysOptional: getRequestedDurationDays(record.metadataJson),
    reviewPath: toReviewPath(record.id),
    requester: {
      organizationId: record.organizationId,
      organizationName: record.organizationName,
      requesterName: record.requesterName,
      requesterUserId: record.requesterUserId,
    },
    scope: record.scope,
    status: record.status,
    subject: {
      displayName: record.subjectDisplayName,
      talentIdentityId: record.subjectTalentIdentityId,
    },
    updatedAt: record.updatedAt,
  };
}

function assertCandidateOwnerActor(actor: AuthenticatedActor, subjectTalentIdentityId: string, correlationId: string) {
  if (actor.actorType === "talent_user" && actor.actorId === subjectTalentIdentityId) {
    return;
  }

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "Only the owning candidate can access this request inbox.",
    details: {
      subjectTalentIdentityId,
    },
    correlationId,
  });
}

function assertRecruiterActor(actor: AuthenticatedActor, correlationId: string) {
  if (actor.actorType === "recruiter_user" || actor.actorType === "hiring_manager_user") {
    return;
  }

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "Recruiter access is required for this request view.",
    details: null,
    correlationId,
  });
}

function getAuthenticatedAppUserId(actor: AuthenticatedActor) {
  return actor.identity?.kind === "authenticated_user" ? actor.identity.appUserId : null;
}

function buildTokenBackedCandidateActor(subjectTalentIdentityId: string): AuthenticatedActor {
  return {
    actorId: subjectTalentIdentityId,
    actorType: "talent_user",
    authMethod: "public",
    identity: null,
  };
}

async function resolveReviewAccess(args: {
  correlationId: string;
  requestId: string;
  reviewTokenOptional?: string | null;
  sessionActorOptional?: AuthenticatedActor | null;
}) {
  const requestRecord = await findAccessRequestProductRecordById({
    requestId: args.requestId,
  });

  if (!requestRecord) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Access request was not found.",
      details: {
        requestId: args.requestId,
      },
      correlationId: args.correlationId,
    });
  }

  if (
    args.sessionActorOptional?.actorType === "talent_user" &&
    args.sessionActorOptional.actorId === requestRecord.subjectTalentIdentityId
  ) {
    return {
      requestRecord,
      reviewAccess: {
        actor: args.sessionActorOptional,
        channel: "session_owner",
        tokenId: null,
        tokenValidated: false,
      } satisfies ReviewAccessResult,
    };
  }

  const trimmedToken = args.reviewTokenOptional?.trim();

  if (trimmedToken) {
    const tokenHash = hashAccessRequestReviewToken(trimmedToken);
    const tokenRecord = await findActiveAccessRequestReviewTokenRecord({
      accessRequestId: args.requestId,
      tokenHash,
    });

    if (tokenRecord) {
      await markAccessRequestReviewTokenViewed({
        tokenId: tokenRecord.id,
      });

      return {
        requestRecord,
        reviewAccess: {
          actor: buildTokenBackedCandidateActor(requestRecord.subjectTalentIdentityId),
          channel: tokenRecord.channel,
          tokenId: tokenRecord.id,
          tokenValidated: true,
        } satisfies ReviewAccessResult,
      };
    }

    const staleTokenRecord = await findAccessRequestReviewTokenRecordByHash({
      accessRequestId: args.requestId,
      tokenHash,
    });

    logAuditEvent({
      actorId: args.sessionActorOptional?.actorId ?? "anonymous_request",
      actorType: args.sessionActorOptional?.actorType ?? "system_service",
      correlationId: args.correlationId,
      eventType: "security.access_request.review.denied",
      metadataJson: {
        reason:
          staleTokenRecord && new Date(staleTokenRecord.expiresAt).getTime() < Date.now()
            ? "expired_token"
            : "invalid_token",
      },
      targetId: args.requestId,
      targetType: "access_request",
    });
  } else {
    logAuditEvent({
      actorId: args.sessionActorOptional?.actorId ?? "anonymous_request",
      actorType: args.sessionActorOptional?.actorType ?? "system_service",
      correlationId: args.correlationId,
      eventType: "security.access_request.review.denied",
      metadataJson: {
        reason: "missing_owner_or_token",
      },
      targetId: args.requestId,
      targetType: "access_request",
    });
  }

  throw new ApiError({
    errorCode: "FORBIDDEN",
    status: 403,
    message: "Secure access-request review authorization is required.",
    details: null,
    correlationId: args.correlationId,
  });
}

async function findGrantedExpiry(args: {
  correlationId: string;
  requesterUserId: string;
  scope: AccessRequestSummaryDto["scope"];
  subjectTalentIdentityId: string;
}) {
  const memberships = await listOrganizationMembershipsForUser({
    status: "active",
    userId: args.requesterUserId,
  });

  for (const membership of memberships) {
    const grant = await findActiveAccessGrant({
      organizationId: membership.organizationId,
      scope: args.scope,
      subjectTalentIdentityId: args.subjectTalentIdentityId,
    });

    if (grant) {
      return grant.expiresAt;
    }
  }

  return null;
}

export async function listCandidateAccessRequests(args: {
  actor: AuthenticatedActor;
  correlationId: string;
}) {
  assertCandidateOwnerActor(args.actor, args.actor.actorId, args.correlationId);

  const records = await listAccessRequestProductRecordsForSubject({
    subjectTalentIdentityId: args.actor.actorId,
  });

  return accessRequestListResponseDtoSchema.parse({
    items: records.map((record) => toSummaryDto(record)),
  }) as AccessRequestListResponseDto;
}

export async function listRecruiterAccessRequests(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  subjectTalentIdentityId?: string | null;
}) {
  assertRecruiterActor(args.actor, args.correlationId);

  const requesterUserId = getAuthenticatedAppUserId(args.actor);

  if (!requesterUserId) {
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "A persistent recruiter identity is required.",
      details: null,
      correlationId: args.correlationId,
    });
  }

  const records = await listAccessRequestProductRecordsForRequester({
    requesterUserId,
    subjectTalentIdentityId: args.subjectTalentIdentityId ?? null,
  });

  return accessRequestListResponseDtoSchema.parse({
    items: records.map((record) => toSummaryDto(record)),
  }) as AccessRequestListResponseDto;
}

export async function getAccessRequestReview(args: {
  correlationId: string;
  requestId: string;
  reviewTokenOptional?: string | null;
  sessionActorOptional?: AuthenticatedActor | null;
}) {
  const { requestRecord, reviewAccess } = await resolveReviewAccess(args);
  const summary = toSummaryDto(requestRecord);

  logAuditEvent({
    actorId: reviewAccess.actor.actorId,
    actorType: reviewAccess.actor.actorType,
    correlationId: args.correlationId,
    eventType: "access.request.review.viewed",
    metadataJson: {
      channel: reviewAccess.channel,
      token_validated: reviewAccess.tokenValidated,
    },
    targetId: requestRecord.id,
    targetType: "access_request",
  });

  return accessRequestReviewDtoSchema.parse({
    ...summary,
    grantedExpiresAtOptional: requestRecord.grantedExpiresAtOptional,
    reviewAccess: {
      channel: reviewAccess.channel,
      tokenValidated: reviewAccess.tokenValidated,
    },
  }) as AccessRequestReviewDto;
}

export async function resolveAccessRequestFromReview(args: {
  action: "grant" | "reject";
  correlationId: string;
  noteOptional?: string | null;
  requestId: string;
  reviewTokenOptional?: string | null;
  sessionActorOptional?: AuthenticatedActor | null;
}) {
  const { reviewAccess } = await resolveReviewAccess({
    correlationId: args.correlationId,
    requestId: args.requestId,
    reviewTokenOptional: args.reviewTokenOptional,
    sessionActorOptional: args.sessionActorOptional,
  });

  if (args.action === "grant") {
    await grantScopedAccessRequest({
      actor: reviewAccess.actor,
      correlationId: args.correlationId,
      note: args.noteOptional ?? null,
      requestId: args.requestId,
    });
  } else {
    await rejectScopedAccessRequest({
      actor: reviewAccess.actor,
      correlationId: args.correlationId,
      note: args.noteOptional ?? null,
      requestId: args.requestId,
    });
  }

  if (reviewAccess.tokenId) {
    await markAccessRequestReviewTokenResolved({
      tokenId: reviewAccess.tokenId,
    });
  }

  await invalidateAccessRequestReviewTokens({
    accessRequestId: args.requestId,
    excludeTokenId: reviewAccess.tokenId,
  });

  return getAccessRequestReview({
    correlationId: args.correlationId,
    requestId: args.requestId,
    reviewTokenOptional: null,
    sessionActorOptional: reviewAccess.actor,
  });
}

export async function revokeAccessRequestGrant(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  noteOptional?: string | null;
  requestId: string;
}) {
  const requestRecord = await findAccessRequestProductRecordById({
    requestId: args.requestId,
  });

  if (!requestRecord) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Access request was not found.",
      details: {
        requestId: args.requestId,
      },
      correlationId: args.correlationId,
    });
  }

  assertCandidateOwnerActor(
    args.actor,
    requestRecord.subjectTalentIdentityId,
    args.correlationId,
  );

  await revokeScopedAccessGrant({
    actor: args.actor,
    correlationId: args.correlationId,
    note: args.noteOptional ?? null,
    requestId: args.requestId,
  });

  return getAccessRequestReview({
    correlationId: args.correlationId,
    requestId: args.requestId,
    reviewTokenOptional: null,
    sessionActorOptional: args.actor,
  });
}

export async function getCandidateNotificationPreferences(args: {
  correlationId: string;
  talentIdentityId: string;
}) {
  const context = await findPersistentContextByTalentIdentityId({
    correlationId: args.correlationId,
    talentIdentityId: args.talentIdentityId,
  });

  return candidateNotificationPreferencesSchema.parse(
    await getCandidateNotificationPreferencesRecord({
      careerIdentityId: args.talentIdentityId,
      phoneNumberConfigured: Boolean(context.aggregate.talentIdentity.phone_optional),
    }),
  ) as CandidateNotificationPreferences;
}

export async function updateCandidateNotificationPreferences(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  input: UpdateCandidateNotificationPreferencesInput;
  talentIdentityId: string;
}) {
  assertCandidateOwnerActor(args.actor, args.talentIdentityId, args.correlationId);
  const context = await findPersistentContextByTalentIdentityId({
    correlationId: args.correlationId,
    talentIdentityId: args.talentIdentityId,
  });
  const phoneNumberConfigured = Boolean(context.aggregate.talentIdentity.phone_optional);

  if (args.input.accessRequestSmsEnabled && !phoneNumberConfigured) {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "Add a phone number before enabling SMS alerts.",
      details: null,
      correlationId: args.correlationId,
    });
  }

  const preferences = await updateCandidateNotificationPreferencesRecord({
    accessRequestSmsEnabled: args.input.accessRequestSmsEnabled,
    careerIdentityId: args.talentIdentityId,
    phoneNumberConfigured,
  });

  logAuditEvent({
    actorId: args.actor.actorId,
    actorType: args.actor.actorType,
    correlationId: args.correlationId,
    eventType: "candidate.notification_preferences.updated",
    metadataJson: {
      access_request_sms_enabled: preferences.accessRequestSmsEnabled,
    },
    targetId: args.talentIdentityId,
    targetType: "talent_identity",
  });

  return candidateNotificationPreferencesSchema.parse(preferences) as CandidateNotificationPreferences;
}

export async function getRecruiterPrivateCandidateProfile(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  subjectTalentIdentityId: string;
}) {
  const hasAccess = await hasScopedCandidateAccess({
    actor: args.actor,
    correlationId: args.correlationId,
    scope: "candidate_private_profile",
    subjectTalentIdentityId: args.subjectTalentIdentityId,
  });

  if (!hasAccess) {
    logAuditEvent({
      actorId: args.actor.actorId,
      actorType: args.actor.actorType,
      correlationId: args.correlationId,
      eventType: "security.access_request.denied",
      metadataJson: {
        reason: "missing_candidate_private_access_grant",
        scope: "candidate_private_profile",
      },
      targetId: args.subjectTalentIdentityId,
      targetType: "talent_identity",
    });
    throw new ApiError({
      errorCode: "FORBIDDEN",
      status: 403,
      message: "Approved candidate access is required before viewing private profile data.",
      details: null,
      correlationId: args.correlationId,
    });
  }

  const context = await findPersistentContextByTalentIdentityId({
    correlationId: args.correlationId,
    talentIdentityId: args.subjectTalentIdentityId,
  });
  const profile = await getPersistentCareerBuilderProfile({
    careerIdentityId: args.subjectTalentIdentityId,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const evidenceRecords = await listPersistentCareerBuilderEvidence({
    careerIdentityId: args.subjectTalentIdentityId,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const claimDetails = await listClaimDetails({
    correlationId: args.correlationId,
    soulRecordIdOptional: context.aggregate.soulRecord.id,
  });
  const requesterUserId = getAuthenticatedAppUserId(args.actor);
  const grantedExpiresAtOptional = requesterUserId
    ? await findGrantedExpiry({
        correlationId: args.correlationId,
        requesterUserId,
        scope: "candidate_private_profile",
        subjectTalentIdentityId: args.subjectTalentIdentityId,
      })
    : null;
  const lastRequestStatusOptional = requesterUserId
    ? (await listAccessRequestProductRecordsForRequester({
        requesterUserId,
        subjectTalentIdentityId: args.subjectTalentIdentityId,
        limit: 1,
      }))[0]?.status ?? null
    : null;

  return recruiterPrivateCandidateProfileDtoSchema.parse({
    access: {
      granted: true,
      grantedExpiresAtOptional,
      lastRequestStatusOptional,
      scope: "candidate_private_profile",
    },
    candidate: {
      careerId: context.aggregate.talentIdentity.talent_agent_id,
      displayName: context.aggregate.talentIdentity.display_name,
      legalName: profile?.legalName ?? null,
    },
    evidenceRecords: evidenceRecords.map((record) => ({
      fileCount: record.files.length,
      id: record.id,
      issuedOn: record.issuedOn,
      sourceOrIssuer: record.sourceOrIssuer,
      status: record.status,
      templateId: record.templateId,
      whyItMatters: record.whyItMatters,
    })),
    employmentRecords: claimDetails.map((details) => ({
      artifactCount: details.artifactIds.length,
      claimId: details.claimId,
      confidenceTierOptional: details.verification.confidence_tier,
      currentlyEmployed: details.employmentRecord.currently_employed,
      employerName: details.employmentRecord.employer_name,
      endDateOptional: details.employmentRecord.end_date_optional,
      lastUpdatedAt: details.verification.updated_at,
      roleTitle: details.employmentRecord.role_title,
      sourceLabelOptional: details.verification.source_label,
      startDate: details.employmentRecord.start_date,
      verificationStatusOptional: details.verification.status,
    })),
    profile: {
      careerHeadline: profile?.careerHeadline ?? null,
      coreNarrative: profile?.coreNarrative ?? null,
      location: profile?.location ?? null,
      targetRole: profile?.targetRole ?? null,
    },
  }) as RecruiterPrivateCandidateProfileDto;
}

export async function getAccessRequestRecordForNotification(args: {
  requestId: string;
}) {
  return findAccessRequestProductRecordById({
    requestId: args.requestId,
  });
}

export async function createAccessRequestReviewTokenRecordForChannel(args: {
  accessRequestId: string;
  channel: "email" | "sms";
  expiresAt: string;
  token: string;
}) {
  return createAccessRequestReviewTokenRecord({
    accessRequestId: args.accessRequestId,
    channel: args.channel,
    expiresAt: args.expiresAt,
    tokenHash: hashAccessRequestReviewToken(args.token),
  });
}
