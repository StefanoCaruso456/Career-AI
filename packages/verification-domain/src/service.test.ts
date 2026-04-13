import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { createEmploymentClaim, resetCredentialStore } from "@/packages/credential-domain/src";
import { createTalentIdentity } from "@/packages/identity-domain/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  addProvenanceRecord,
  getVerificationRecord,
  listProvenanceRecords,
  resetVerificationStore,
  transitionVerificationRecord,
} from "@/packages/verification-domain/src";

describe("verification service", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetCredentialStore();
    resetVerificationStore();
    resetAuditStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  async function seedClaim() {
    const identity = await createTalentIdentity({
      input: {
        countryCode: "US",
        email: "verification@example.com",
        firstName: "Verify",
        lastName: "Candidate",
      },
      actorId: "seed",
      actorType: "system_service",
      correlationId: "corr-seed-1",
    });

    const created = await createEmploymentClaim({
      input: {
        soulRecordId: identity.soulRecord.id,
        employerName: "Acme",
        roleTitle: "Senior Engineer",
        startDate: "2022-01-01",
        currentlyEmployed: false,
      },
      actorId: identity.talentIdentity.id,
      actorType: "talent_user",
      correlationId: "corr-seed-2",
    });

    return created;
  }

  it("allows valid transitions", async () => {
    const created = await seedClaim();

    const transitioned = await transitionVerificationRecord({
      verificationRecordId: created.verificationRecord.id,
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

  it("rejects invalid transitions", async () => {
    const created = await seedClaim();

    await expect(
      transitionVerificationRecord({
        verificationRecordId: created.verificationRecord.id,
        targetStatus: "MULTI_SOURCE_VERIFIED",
        reason: "Skip ahead",
        reviewerActorId: "admin_1",
        actorType: "reviewer_admin",
        actorId: "admin_1",
        correlationId: "corr-2",
      }),
    ).rejects.toThrowError(/cannot transition/i);
  });

  it("stores provenance entries", async () => {
    const created = await seedClaim();

    const provenance = await addProvenanceRecord({
      verificationRecordId: created.verificationRecord.id,
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

    expect(provenance.verification_record_id).toBe(created.verificationRecord.id);
    expect(provenance.source_method).toBe("INTERNAL_REVIEW");
  });

  it("loads verification state from durable storage after the in-memory store resets", async () => {
    const created = await seedClaim();

    await addProvenanceRecord({
      verificationRecordId: created.verificationRecord.id,
      input: {
        sourceActorType: "reviewer_admin",
        sourceMethod: "INTERNAL_REVIEW",
        sourceDetails: {
          reason: "Reviewed by verifier",
        },
      },
      actorType: "reviewer_admin",
      actorId: "admin_1",
      correlationId: "corr-durable-2",
    });

    resetVerificationStore();

    await expect(
      getVerificationRecord({
        verificationRecordId: created.verificationRecord.id,
        correlationId: "corr-durable-3",
      }),
    ).resolves.toMatchObject({
      id: created.verificationRecord.id,
      status: "SUBMITTED",
    });
    await expect(
      listProvenanceRecords({
        verificationRecordId: created.verificationRecord.id,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        source_method: "INTERNAL_REVIEW",
      }),
    ]);
  });
});
