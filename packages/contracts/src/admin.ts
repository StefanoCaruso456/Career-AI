import { z } from "zod";
import {
  verificationConfidenceTierSchema,
  verificationStatusSchema,
} from "./enums";

export const reviewDecisionTargetStatusSchema = z.enum([
  "PARTIALLY_VERIFIED",
  "REVIEWED",
  "SOURCE_VERIFIED",
  "MULTI_SOURCE_VERIFIED",
  "REJECTED",
  "NEEDS_RESUBMISSION",
]);

export const reviewQueueItemSchema = z.object({
  claim_id: z.string(),
  verification_record_id: z.string(),
  talent_identity_id: z.string(),
  candidate_display_name: z.string(),
  claim_type: z.string(),
  title: z.string(),
  summary: z.string(),
  verification_status: verificationStatusSchema,
  confidence_tier: verificationConfidenceTierSchema,
  artifact_count: z.number().int().nonnegative(),
  submitted_at: z.string().datetime(),
  last_updated_at: z.string().datetime(),
});

export const reviewDecisionInputSchema = z.object({
  verificationRecordId: z.string(),
  targetStatus: reviewDecisionTargetStatusSchema,
  reason: z.string().trim().min(1),
  reviewerActorId: z.string().trim().min(1),
});

export type ReviewDecisionTargetStatus = z.infer<
  typeof reviewDecisionTargetStatusSchema
>;
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionInputSchema>;

export type ReviewQueueItemDto = {
  claimId: string;
  verificationRecordId: string;
  talentIdentityId: string;
  candidateDisplayName: string;
  claimType: string;
  title: string;
  summary: string;
  verificationStatus: z.infer<typeof verificationStatusSchema>;
  confidenceTier: z.infer<typeof verificationConfidenceTierSchema>;
  artifactCount: number;
  submittedAt: string;
  lastUpdatedAt: string;
};

export type AdminClaimAuditDto = {
  claim: {
    claimId: string;
    claimType: string;
    title: string;
    summary: string;
    artifactIds: string[];
    createdAt: string;
    updatedAt: string;
  };
  candidate: {
    talentIdentityId: string;
    displayName: string;
  };
  verification: {
    id: string;
    status: z.infer<typeof verificationStatusSchema>;
    confidenceTier: z.infer<typeof verificationConfidenceTierSchema>;
    sourceLabel: string;
    reviewedAtOptional: string | null;
    notesOptional: string | null;
  };
  provenance: Array<{
    id: string;
    sourceMethod: string;
    sourceActorType: string;
    sourceActorIdOptional: string | null;
    createdAt: string;
    sourceDetails: Record<string, unknown>;
  }>;
  auditEvents: Array<{
    eventId: string;
    eventType: string;
    actorType: string;
    actorId: string;
    targetType: string;
    targetId: string;
    occurredAt: string;
    metadata: Record<string, unknown>;
  }>;
};
