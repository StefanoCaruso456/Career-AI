import { beforeEach, describe, expect, it } from "vitest";
import {
  resetAuditStore,
} from "@/packages/audit-security/src";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { createEmploymentClaim, resetCredentialStore } from "@/packages/credential-domain/src";
import {
  createTalentIdentity,
  getTalentIdentity,
  resetIdentityStore,
  updatePrivacySettings,
} from "@/packages/identity-domain/src";
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
  beforeEach(() => {
    resetIdentityStore();
    resetCredentialStore();
    resetVerificationStore();
    resetArtifactStore();
    resetAuditStore();
    resetRecruiterReadModelStore();
  });

  it("generates a recruiter-safe profile from visible records", () => {
    const aggregate = createTalentIdentity({
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

    updatePrivacySettings({
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

    createEmploymentClaim({
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

    const profile = generateRecruiterTrustProfile({
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

    const refreshed = getTalentIdentity({
      talentIdentityId: aggregate.talentIdentity.id,
      correlationId: "corr-5",
    });

    expect(refreshed.soulRecord.default_share_profile_id).toBe(profile.id);

    const qr = generateShareProfileQr({
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

  it("blocks share profile generation when public links are disabled", () => {
    const aggregate = createTalentIdentity({
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

    expect(() =>
      generateRecruiterTrustProfile({
        input: {
          talentIdentityId: aggregate.talentIdentity.id,
        },
        actorType: "talent_user",
        actorId: aggregate.talentIdentity.id,
        correlationId: "corr-2",
      }),
    ).toThrowError(/public share links are disabled/i);
  });

  it("refreshes recruiter projections when verification state changes", () => {
    const aggregate = createTalentIdentity({
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

    updatePrivacySettings({
      talentIdentityId: aggregate.talentIdentity.id,
      input: {
        showEmploymentRecords: true,
        allowPublicShareLink: true,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-2",
    });

    const created = createEmploymentClaim({
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

    const profile = generateRecruiterTrustProfile({
      input: {
        talentIdentityId: aggregate.talentIdentity.id,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-4",
    });

    transitionVerificationRecord({
      verificationRecordId: created.verificationRecord.id,
      targetStatus: "REVIEWED",
      reason: "Updated after review",
      reviewerActorId: "admin_9",
      actorType: "reviewer_admin",
      actorId: "admin_9",
      correlationId: "corr-5",
    });

    const refreshed = getRecruiterTrustProfileByToken({
      token: profile.publicShareToken,
      actorType: "system_service",
      actorId: "public_request",
      correlationId: "corr-6",
    });

    expect(refreshed.trustSummary.totalReviewedClaims).toBe(1);
    expect(refreshed.visibleEmploymentRecords[0]?.verificationStatusOptional).toBe("REVIEWED");
  });
});
