import {
  adminAccessControlOverviewDtoSchema,
  reviewDecisionInputSchema,
  type ActorType,
  type AdminAccessControlOverviewDto,
  type AdminClaimAuditDto,
  type ReviewDecisionInput,
  type ReviewQueueItem,
  type ReviewQueueItemDto,
} from "@/packages/contracts/src";
import { listAuditEvents, logAuditEvent } from "@/packages/audit-security/src";
import { getClaim, getClaimDetails, listClaimDetails } from "@/packages/credential-domain/src";
import { getTalentIdentityBySoulRecordId } from "@/packages/identity-domain/src";
import {
  listProvenanceRecords,
  transitionVerificationRecord,
} from "@/packages/verification-domain/src";
import { listAccessRequestProductRecordsForAdmin } from "@/packages/persistence/src";

const pendingStatuses = new Set([
  "SUBMITTED",
  "PARSED",
  "PENDING_REVIEW",
  "PARTIALLY_VERIFIED",
  "NEEDS_RESUBMISSION",
]);

function toReviewQueueItemDto(item: ReviewQueueItem): ReviewQueueItemDto {
  return {
    claimId: item.claim_id,
    verificationRecordId: item.verification_record_id,
    talentIdentityId: item.talent_identity_id,
    candidateDisplayName: item.candidate_display_name,
    claimType: item.claim_type,
    title: item.title,
    summary: item.summary,
    verificationStatus: item.verification_status,
    confidenceTier: item.confidence_tier,
    artifactCount: item.artifact_count,
    submittedAt: item.submitted_at,
    lastUpdatedAt: item.last_updated_at,
  };
}

function toAdminAccessControlRecord(record: Awaited<
  ReturnType<typeof listAccessRequestProductRecordsForAdmin>
>[number]) {
  return {
    grantedAtOptional: record.grantedAt,
    grantedExpiresAtOptional: record.grantedExpiresAtOptional,
    grantIdOptional: record.grantIdOptional,
    grantLifecycleStatusOptional: record.grantLifecycleStatusOptional,
    grantRevokedAtOptional: record.grantRevokedAtOptional,
    justification: record.justification,
    organizationId: record.organizationId,
    organizationName: record.organizationName,
    requestCreatedAt: record.createdAt,
    requestId: record.id,
    requesterName: record.requesterName,
    requesterUserId: record.requesterUserId,
    requestStatus: record.status,
    requestUpdatedAt: record.updatedAt,
    scope: record.scope,
    subjectDisplayName: record.subjectDisplayName,
    subjectTalentIdentityId: record.subjectTalentIdentityId,
  };
}

export function listPendingReviewQueue(args: {
  correlationId: string;
}) {
  return listPendingReviewQueueAsync(args);
}

async function listPendingReviewQueueAsync(args: {
  correlationId: string;
}): Promise<ReviewQueueItemDto[]> {
  const claimDetails = await listClaimDetails({
    correlationId: args.correlationId,
  });

  const items = await Promise.all(
    claimDetails.map(async (details) => {
      const claim = await getClaim({
        claimId: details.claimId,
        correlationId: args.correlationId,
      });
      const owner = await getTalentIdentityBySoulRecordId({
        soulRecordId: claim.soul_record_id,
        correlationId: args.correlationId,
      });

      const item: ReviewQueueItem = {
        claim_id: details.claimId,
        verification_record_id: details.verification.id,
        talent_identity_id: owner.talentIdentity.id,
        candidate_display_name: owner.talentIdentity.display_name,
        claim_type: details.claimType,
        title: details.title,
        summary: details.summary,
        verification_status: details.verification.status,
        confidence_tier: details.verification.confidence_tier,
        artifact_count: details.artifactIds.length,
        submitted_at: details.createdAt,
        last_updated_at: details.verification.updated_at,
      };

      return item;
    }),
  );

  return items
    .filter((item) => pendingStatuses.has(item.verification_status))
    .sort((left, right) => right.last_updated_at.localeCompare(left.last_updated_at))
    .map(toReviewQueueItemDto);
}

export function submitReviewDecision(args: {
  input: ReviewDecisionInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  return submitReviewDecisionAsync(args);
}

async function submitReviewDecisionAsync(args: {
  input: ReviewDecisionInput;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const input = reviewDecisionInputSchema.parse(args.input);
  const updatedRecord = await transitionVerificationRecord({
    verificationRecordId: input.verificationRecordId,
    targetStatus: input.targetStatus,
    reason: input.reason,
    reviewerActorId: input.reviewerActorId,
    actorType: args.actorType,
    actorId: args.actorId,
    correlationId: args.correlationId,
  });

  logAuditEvent({
    eventType: "admin.review.decision.submitted",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "verification_record",
    targetId: updatedRecord.id,
    correlationId: args.correlationId,
    metadataJson: {
      target_status: input.targetStatus,
      reason: input.reason,
    },
  });

  return updatedRecord;
}

export function getClaimAuditTrail(args: {
  claimId: string;
  correlationId: string;
}) {
  return getClaimAuditTrailAsync(args);
}

export function listAccessControlOverview(args: {
  correlationId: string;
}) {
  return listAccessControlOverviewAsync(args);
}

async function listAccessControlOverviewAsync(args: {
  correlationId: string;
}): Promise<AdminAccessControlOverviewDto> {
  const records = (await listAccessRequestProductRecordsForAdmin()).map(toAdminAccessControlRecord);
  const requests = records;
  const activeGrants = records.filter((record) => record.grantLifecycleStatusOptional === "active");
  const lifecycleHistory = records.filter(
    (record) =>
      record.requestStatus === "rejected" ||
      record.grantLifecycleStatusOptional === "revoked" ||
      record.grantLifecycleStatusOptional === "expired",
  );

  return adminAccessControlOverviewDtoSchema.parse({
    activeGrants,
    lifecycleHistory,
    requests,
  }) as AdminAccessControlOverviewDto;
}

async function getClaimAuditTrailAsync(args: {
  claimId: string;
  correlationId: string;
}): Promise<AdminClaimAuditDto> {
  const details = await getClaimDetails({
    claimId: args.claimId,
    correlationId: args.correlationId,
  });
  const claim = await getClaim({
    claimId: args.claimId,
    correlationId: args.correlationId,
  });
  const owner = await getTalentIdentityBySoulRecordId({
    soulRecordId: claim.soul_record_id,
    correlationId: args.correlationId,
  });
  const provenance = await listProvenanceRecords({
    verificationRecordId: details.verification.id,
  });
  const relatedTargetIds = new Set([
    details.claimId,
    details.verification.id,
    ...details.artifactIds,
  ]);
  const auditEvents = listAuditEvents()
    .filter((event) => relatedTargetIds.has(event.target_id))
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));

  return {
    claim: {
      claimId: details.claimId,
      claimType: details.claimType,
      title: details.title,
      summary: details.summary,
      artifactIds: details.artifactIds,
      createdAt: details.createdAt,
      updatedAt: details.updatedAt,
    },
    candidate: {
      talentIdentityId: owner.talentIdentity.id,
      displayName: owner.talentIdentity.display_name,
    },
    verification: {
      id: details.verification.id,
      status: details.verification.status,
      confidenceTier: details.verification.confidence_tier,
      sourceLabel: details.verification.source_label,
      reviewedAtOptional: details.verification.reviewed_at_optional,
      notesOptional: details.verification.notes_optional,
    },
    provenance: provenance.map((entry) => ({
      id: entry.id,
      sourceMethod: entry.source_method,
      sourceActorType: entry.source_actor_type,
      sourceActorIdOptional: entry.source_actor_id_optional,
      createdAt: entry.created_at,
      sourceDetails: entry.source_details_json,
    })),
    auditEvents: auditEvents.map((event) => ({
      eventId: event.event_id,
      eventType: event.event_type,
      actorType: event.actor_type,
      actorId: event.actor_id,
      targetType: event.target_type,
      targetId: event.target_id,
      occurredAt: event.occurred_at,
      metadata: event.metadata_json,
    })),
  };
}

export function getAdminOpsMetrics() {
  return getAdminOpsMetricsAsync();
}

async function getAdminOpsMetricsAsync() {
  return {
    pendingReviewItems: (
      await listPendingReviewQueue({
      correlationId: "health-admin-metrics",
      })
    ).length,
  };
}
