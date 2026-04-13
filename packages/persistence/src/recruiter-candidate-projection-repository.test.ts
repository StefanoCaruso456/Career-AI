import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updatePrivacySettings } from "@/packages/identity-domain/src";
import {
  findPersistentRecruiterCandidateProjectionByLookup,
  findPersistentSharedRecruiterCandidateProjectionByLookup,
  provisionGoogleUser,
  updateCareerProfileBasics,
  updateRoleSelection,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  generateRecruiterTrustProfile,
  resetRecruiterReadModelStore,
} from "@/packages/recruiter-read-model/src";

describe("recruiter candidate projection repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetRecruiterReadModelStore();
  });

  afterEach(async () => {
    resetRecruiterReadModelStore();
    await resetTestDatabase();
  });

  it("resolves explicit shared-profile lookups even when the candidate is not searchable", async () => {
    const candidate = await provisionGoogleUser({
      correlationId: "shared-private-candidate",
      email: "shared-private@example.com",
      emailVerified: true,
      firstName: "Morgan",
      fullName: "Morgan Hale",
      lastName: "Hale",
      providerUserId: "google-shared-private",
    });

    await updateRoleSelection({
      correlationId: "shared-private-role",
      roleType: "candidate",
      userId: candidate.context.user.id,
    });
    await updateCareerProfileBasics({
      correlationId: "shared-private-profile",
      profilePatch: {
        headline: "Principal Security Engineer",
        intent: "Keeps sensitive employer history private.",
        location: "Remote - US",
        recruiterVisibility: "private",
      },
      userId: candidate.context.user.id,
    });
    await updatePrivacySettings({
      talentIdentityId: candidate.context.aggregate.talentIdentity.id,
      input: {
        allowPublicShareLink: true,
      },
      actorType: "talent_user",
      actorId: candidate.context.aggregate.talentIdentity.id,
      correlationId: "shared-private-privacy",
    });

    const profile = await generateRecruiterTrustProfile({
      input: {
        talentIdentityId: candidate.context.aggregate.talentIdentity.id,
      },
      actorType: "talent_user",
      actorId: candidate.context.aggregate.talentIdentity.id,
      correlationId: "shared-private-share-profile",
    });

    await expect(
      findPersistentRecruiterCandidateProjectionByLookup({
        lookup: profile.publicShareToken,
      }),
    ).resolves.toBeNull();

    await expect(
      findPersistentSharedRecruiterCandidateProjectionByLookup({
        lookup: profile.publicShareToken,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        candidateId: candidate.context.aggregate.talentIdentity.id,
        publicShareToken: profile.publicShareToken,
        searchable: false,
        shareProfileId: profile.id,
      }),
    );
    await expect(
      findPersistentSharedRecruiterCandidateProjectionByLookup({
        lookup: profile.id,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        candidateId: candidate.context.aggregate.talentIdentity.id,
        publicShareToken: profile.publicShareToken,
        searchable: false,
        shareProfileId: profile.id,
      }),
    );
  });
});
