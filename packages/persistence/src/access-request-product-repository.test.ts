import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAccessRequestRecord,
  createOrganizationMembershipRecord,
  createOrganizationRecord,
  createAccessRequestReviewTokenRecord,
  findAccessRequestProductRecordById,
  findActiveAccessRequestReviewTokenRecord,
  getCandidateNotificationPreferencesRecord,
  invalidateAccessRequestReviewTokens,
  listAccessRequestProductRecordsForRequester,
  listAccessRequestProductRecordsForSubject,
  markAccessRequestReviewTokenResolved,
  markAccessRequestReviewTokenViewed,
  provisionGoogleUser,
  updateCandidateNotificationPreferencesRecord,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "./test-helpers";

describe("access-request product repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  async function seedUsers() {
    const recruiter = await provisionGoogleUser({
      correlationId: "corr-recruiter",
      email: "recruiter@example.com",
      emailVerified: true,
      firstName: "Riley",
      fullName: "Riley Recruiter",
      lastName: "Recruiter",
      providerUserId: "provider-recruiter",
    });
    const candidate = await provisionGoogleUser({
      correlationId: "corr-candidate",
      email: "candidate@example.com",
      emailVerified: true,
      firstName: "Casey",
      fullName: "Casey Candidate",
      lastName: "Candidate",
      providerUserId: "provider-candidate",
    });

    return {
      candidate,
      recruiter,
    };
  }

  it("lists candidate and recruiter access-request records with joined display fields", async () => {
    const { candidate, recruiter } = await seedUsers();
    const organization = await createOrganizationRecord({
      name: "Northstar Hiring",
    });

    await createOrganizationMembershipRecord({
      organizationId: organization.id,
      role: "owner",
      userId: recruiter.context.user.id,
    });

    const request = await createAccessRequestRecord({
      justification: "Need private verification records for the final interview loop.",
      metadataJson: {
        requested_duration_days: 30,
      },
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    const candidateList = await listAccessRequestProductRecordsForSubject({
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });
    const recruiterList = await listAccessRequestProductRecordsForRequester({
      requesterUserId: recruiter.context.user.id,
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });
    const detail = await findAccessRequestProductRecordById({
      requestId: request.id,
    });

    expect(candidateList[0]).toMatchObject({
      id: request.id,
      organizationName: "Northstar Hiring",
      requesterName: "Riley Recruiter",
      subjectDisplayName: "Casey Candidate",
    });
    expect(recruiterList[0]?.id).toBe(request.id);
    expect(detail?.metadataJson).toMatchObject({
      requested_duration_days: 30,
    });
  });

  it("persists review tokens and candidate notification preferences", async () => {
    const { candidate, recruiter } = await seedUsers();
    const organization = await createOrganizationRecord({
      name: "Northstar Hiring",
    });

    await createOrganizationMembershipRecord({
      organizationId: organization.id,
      role: "owner",
      userId: recruiter.context.user.id,
    });

    const request = await createAccessRequestRecord({
      justification: "Need private profile review.",
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });
    const token = await createAccessRequestReviewTokenRecord({
      accessRequestId: request.id,
      channel: "email",
      expiresAt: "2099-01-01T00:00:00.000Z",
      tokenHash: "token-hash-123",
    });

    await markAccessRequestReviewTokenViewed({
      tokenId: token.id,
    });
    await markAccessRequestReviewTokenResolved({
      tokenId: token.id,
    });

    expect(
      await findActiveAccessRequestReviewTokenRecord({
        accessRequestId: request.id,
        tokenHash: "token-hash-123",
      }),
    ).toBeNull();

    await invalidateAccessRequestReviewTokens({
      accessRequestId: request.id,
    });

    expect(
      await getCandidateNotificationPreferencesRecord({
        careerIdentityId: candidate.context.aggregate.talentIdentity.id,
        phoneNumberConfigured: false,
      }),
    ).toMatchObject({
      accessRequestEmailEnabled: true,
      accessRequestSmsEnabled: false,
      phoneNumberConfigured: false,
    });

    expect(
      await updateCandidateNotificationPreferencesRecord({
        accessRequestSmsEnabled: true,
        careerIdentityId: candidate.context.aggregate.talentIdentity.id,
        phoneNumberConfigured: true,
      }),
    ).toMatchObject({
      accessRequestSmsEnabled: true,
      phoneNumberConfigured: true,
    });
  });
});
