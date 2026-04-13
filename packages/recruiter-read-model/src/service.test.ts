import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetAuditStore,
} from "@/packages/audit-security/src";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { createEmploymentClaim, resetCredentialStore } from "@/packages/credential-domain/src";
import {
  createTalentIdentity,
  getTalentIdentity,
  updatePrivacySettings,
} from "@/packages/identity-domain/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  resetVerificationStore,
  transitionVerificationRecord,
} from "@/packages/verification-domain/src";
import {
  generateRecruiterTrustProfile,
  getRecruiterTrustProfileByToken,
  generateShareProfileQr,
  resetRecruiterReadModelStore,
} from "@/packages/recruiter-read-model/src";

describe("recruiter read model service", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetCredentialStore();
    resetVerificationStore();
    resetArtifactStore();
    resetAuditStore();
    resetRecruiterReadModelStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("generates a recruiter-safe profile from visible records", async () => {
    const aggregate = await createTalentIdentity({
      input: {
        email: "share@example.com",
        firstName: "Nina",
        lastName: "Stone",
        countryCode: "US",
      },
      actorType: "talent_user",
      actorId: "seed-user",
      correlationId: "corr-1",
    });

    await updatePrivacySettings({
      talentIdentityId: aggregate.talentIdentity.id,
      input: {
        showEmploymentRecords: true,
        allowPublicShareLink: true,
        allowQrShare: true,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-2",
    });

    await createEmploymentClaim({
      input: {
        soulRecordId: aggregate.soulRecord.id,
        employerName: "Acme Inc",
        roleTitle: "Platform Lead",
        startDate: "2022-01-15",
        currentlyEmployed: true,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-3",
    });

    const profile = await generateRecruiterTrustProfile({
      input: {
        talentIdentityId: aggregate.talentIdentity.id,
        baseUrlOptional: "https://talentagentid.test",
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-4",
    });

    expect(profile.candidate.displayName).toBe("Nina Stone");
    expect(profile.visibleEmploymentRecords).toHaveLength(1);
    expect(profile.shareUrl).toContain("/share/");
    expect(profile.trustSummary.totalClaims).toBe(1);

    const refreshed = await getTalentIdentity({
      talentIdentityId: aggregate.talentIdentity.id,
      correlationId: "corr-5",
    });

    expect(refreshed.soulRecord.default_share_profile_id).toBe(profile.id);

    const qr = await generateShareProfileQr({
      profileId: profile.id,
      input: {
        baseUrlOptional: "https://talentagentid.test",
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-6",
    });

    expect(qr.shareUrl).toBe(profile.shareUrl);
    expect(qr.qrPayload).toContain(profile.publicShareToken);
  });

  it("blocks share profile generation when public links are disabled", async () => {
    const aggregate = await createTalentIdentity({
      input: {
        email: "private@example.com",
        firstName: "Private",
        lastName: "Profile",
        countryCode: "US",
      },
      actorType: "talent_user",
      actorId: "seed-user",
      correlationId: "corr-1",
    });

    await expect(
      generateRecruiterTrustProfile({
        input: {
          talentIdentityId: aggregate.talentIdentity.id,
        },
        actorType: "talent_user",
        actorId: aggregate.talentIdentity.id,
        correlationId: "corr-2",
      }),
    ).rejects.toThrowError(/public share links are disabled/i);
  });

  it("refreshes recruiter projections when verification state changes", async () => {
    const aggregate = await createTalentIdentity({
      input: {
        email: "refresh@example.com",
        firstName: "Refresh",
        lastName: "View",
        countryCode: "US",
      },
      actorType: "talent_user",
      actorId: "seed-user",
      correlationId: "corr-1",
    });

    await updatePrivacySettings({
      talentIdentityId: aggregate.talentIdentity.id,
      input: {
        showEmploymentRecords: true,
        allowPublicShareLink: true,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-2",
    });

    const created = await createEmploymentClaim({
      input: {
        soulRecordId: aggregate.soulRecord.id,
        employerName: "Orbit Works",
        roleTitle: "Delivery Lead",
        startDate: "2022-09-01",
        currentlyEmployed: false,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-3",
    });

    const profile = await generateRecruiterTrustProfile({
      input: {
        talentIdentityId: aggregate.talentIdentity.id,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-4",
    });

    await transitionVerificationRecord({
      verificationRecordId: created.verificationRecord.id,
      targetStatus: "REVIEWED",
      reason: "Updated after review",
      reviewerActorId: "admin_9",
      actorType: "reviewer_admin",
      actorId: "admin_9",
      correlationId: "corr-5",
    });

    const refreshed = await getRecruiterTrustProfileByToken({
      token: profile.publicShareToken,
      actorType: "system_service",
      actorId: "public_request",
      correlationId: "corr-6",
    });

    expect(refreshed.trustSummary.totalReviewedClaims).toBe(1);
    expect(refreshed.visibleEmploymentRecords[0]?.verificationStatusOptional).toBe("REVIEWED");
  });
});
