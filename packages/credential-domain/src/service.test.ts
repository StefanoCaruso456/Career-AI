import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetArtifactStore, uploadArtifact, attachArtifactToClaim } from "@/packages/artifact-domain/src";
import { resetAuditStore } from "@/packages/audit-security/src";
import {
  attachArtifactToEmploymentClaim,
  createEmploymentClaim,
  getClaimDetails,
  resetCredentialStore,
} from "@/packages/credential-domain/src";
import { createTalentIdentity } from "@/packages/identity-domain/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import { resetVerificationStore } from "@/packages/verification-domain/src";

describe("credential service", () => {
  beforeEach(async () => {
    resetArtifactStore();
    resetAuditStore();
    resetCredentialStore();
    await resetTestDatabase();
    await installTestDatabase();
    resetVerificationStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates an employment claim with a verification record", async () => {
    const identity = await createTalentIdentity({
      input: {
        email: "claims@example.com",
        firstName: "Claim",
        lastName: "Owner",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const created = await createEmploymentClaim({
      input: {
        soulRecordId: identity.soulRecord.id,
        employerName: "Acme Inc",
        roleTitle: "Product Manager",
        startDate: "2022-01-15",
        endDate: "2024-02-28",
        currentlyEmployed: false,
      },
      actorType: "talent_user",
      actorId: identity.talentIdentity.id,
      correlationId: "corr-2",
    });

    expect(created.claim.claim_type).toBe("EMPLOYMENT");
    expect(created.verificationRecord.status).toBe("SUBMITTED");
    expect(created.verificationRecord.confidence_tier).toBe("SELF_REPORTED");
  });

  it("elevates confidence when an artifact is attached", async () => {
    const identity = await createTalentIdentity({
      input: {
        email: "claims@example.com",
        firstName: "Claim",
        lastName: "Owner",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const created = await createEmploymentClaim({
      input: {
        soulRecordId: identity.soulRecord.id,
        employerName: "Acme Inc",
        roleTitle: "Product Manager",
        startDate: "2022-01-15",
        endDate: "2024-02-28",
        currentlyEmployed: false,
      },
      actorType: "talent_user",
      actorId: identity.talentIdentity.id,
      correlationId: "corr-2",
    });

    const artifact = await uploadArtifact({
      file: new File(["offer-letter"], "offer-letter.pdf", {
        type: "application/pdf",
      }),
      ownerTalentId: identity.talentIdentity.id,
      actorType: "talent_user",
      actorId: identity.talentIdentity.id,
      correlationId: "corr-3",
    });

    attachArtifactToClaim({
      claimId: created.claim.id,
      artifactId: artifact.artifact.artifact_id,
      actorType: "talent_user",
      actorId: identity.talentIdentity.id,
      correlationId: "corr-4",
    });

    const updated = await attachArtifactToEmploymentClaim({
      claimId: created.claim.id,
      actorType: "talent_user",
      actorId: identity.talentIdentity.id,
      correlationId: "corr-5",
    });

    expect(updated.verification.confidence_tier).toBe("EVIDENCE_SUBMITTED");

    const details = await getClaimDetails({
      claimId: created.claim.id,
      correlationId: "corr-6",
    });

    expect(details.artifactIds).toEqual([artifact.artifact.artifact_id]);
  });

  it("loads claim details from durable storage after in-memory stores reset", async () => {
    const identity = await createTalentIdentity({
      input: {
        email: "durable-claim@example.com",
        firstName: "Durable",
        lastName: "Candidate",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-durable-1",
    });

    const created = await createEmploymentClaim({
      input: {
        soulRecordId: identity.soulRecord.id,
        employerName: "Signal Labs",
        roleTitle: "Program Manager",
        startDate: "2021-02-01",
        currentlyEmployed: false,
      },
      actorType: "talent_user",
      actorId: identity.talentIdentity.id,
      correlationId: "corr-durable-2",
    });

    resetCredentialStore();
    resetVerificationStore();

    await expect(
      getClaimDetails({
        claimId: created.claim.id,
        correlationId: "corr-durable-3",
      }),
    ).resolves.toMatchObject({
      claimId: created.claim.id,
      verification: expect.objectContaining({
        id: created.verificationRecord.id,
        status: "SUBMITTED",
      }),
    });
  });
});
