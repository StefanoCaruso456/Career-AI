import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { createVerificationRecord, resetVerificationStore, addProvenanceRecord, transitionVerificationRecord } from "@/packages/verification-domain/src";

describe("verification service", () => {
  beforeEach(() => {
    resetVerificationStore();
    resetAuditStore();
  });

  it("allows valid transitions", () => {
    const record = createVerificationRecord({
      input: {
        claimId: "claim_1",
        status: "SUBMITTED",
        confidenceTier: "SELF_REPORTED",
        primaryMethod: "USER_UPLOAD",
        sourceLabel: "candidate_self_report",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const transitioned = transitionVerificationRecord({
      verificationRecordId: record.id,
      targetStatus: "REVIEWED",
      reason: "Document validated",
      reviewerActorId: "admin_1",
      actorType: "reviewer_admin",
      actorId: "admin_1",
      correlationId: "corr-2",
    });

    expect(transitioned.status).toBe("REVIEWED");
    expect(transitioned.confidence_tier).toBe("REVIEWED");
  });

  it("rejects invalid transitions", () => {
    const record = createVerificationRecord({
      input: {
        claimId: "claim_1",
        status: "SUBMITTED",
        confidenceTier: "SELF_REPORTED",
        primaryMethod: "USER_UPLOAD",
        sourceLabel: "candidate_self_report",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    expect(() =>
      transitionVerificationRecord({
        verificationRecordId: record.id,
        targetStatus: "MULTI_SOURCE_VERIFIED",
        reason: "Skip ahead",
        reviewerActorId: "admin_1",
        actorType: "reviewer_admin",
        actorId: "admin_1",
        correlationId: "corr-2",
      }),
    ).toThrowError(/cannot transition/i);
  });

  it("stores provenance entries", () => {
    const record = createVerificationRecord({
      input: {
        claimId: "claim_1",
        status: "SUBMITTED",
        confidenceTier: "SELF_REPORTED",
        primaryMethod: "USER_UPLOAD",
        sourceLabel: "candidate_self_report",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const provenance = addProvenanceRecord({
      verificationRecordId: record.id,
      input: {
        sourceActorType: "reviewer_admin",
        sourceMethod: "INTERNAL_REVIEW",
        sourceDetails: {
          reason: "Reviewed offer letter",
        },
      },
      actorType: "reviewer_admin",
      actorId: "admin_1",
      correlationId: "corr-2",
    });

    expect(provenance.verification_record_id).toBe(record.id);
    expect(provenance.source_method).toBe("INTERNAL_REVIEW");
  });
});
