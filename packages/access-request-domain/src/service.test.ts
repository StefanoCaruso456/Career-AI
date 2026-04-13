import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import {
  createAccessRequestRecord,
  createAccessRequestReviewTokenRecord,
  createOrganizationMembershipRecord,
  createOrganizationRecord,
  provisionGoogleUser,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import { hashAccessRequestReviewToken } from "@/lib/access-request-review-tokens";
import {
  getAccessRequestReview,
  getRecruiterPrivateCandidateProfile,
  resolveAccessRequestFromReview,
  updateCandidateNotificationPreferences,
} from "./service";

describe("access-request domain service", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetAuditStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
    resetAuditStore();
  });

  async function seedActors() {
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
    const organization = await createOrganizationRecord({
      name: "Northstar Hiring",
    });

    await createOrganizationMembershipRecord({
      organizationId: organization.id,
      role: "owner",
      userId: recruiter.context.user.id,
    });

    return {
      candidateActor: {
        actorId: candidate.context.aggregate.talentIdentity.id,
        actorType: "talent_user" as const,
        authMethod: "session" as const,
        identity: {
          appUserId: candidate.context.user.id,
          authProvider: candidate.context.user.authProvider,
          authSource: "nextauth_session" as const,
          email: candidate.context.user.email,
          id: `user:${candidate.context.aggregate.talentIdentity.id}` as const,
          kind: "authenticated_user" as const,
          name: candidate.context.user.fullName,
          preferredPersona: "job_seeker" as const,
          providerUserId: candidate.context.user.providerUserId,
          roleType: "candidate",
          talentIdentityId: candidate.context.aggregate.talentIdentity.id,
        },
      },
      candidate,
      organization,
      recruiterActor: {
        actorId: recruiter.context.aggregate.talentIdentity.id,
        actorType: "recruiter_user" as const,
        authMethod: "session" as const,
        identity: {
          appUserId: recruiter.context.user.id,
          authProvider: recruiter.context.user.authProvider,
          authSource: "nextauth_session" as const,
          email: recruiter.context.user.email,
          id: `user:${recruiter.context.aggregate.talentIdentity.id}` as const,
          kind: "authenticated_user" as const,
          name: recruiter.context.user.fullName,
          preferredPersona: "employer" as const,
          providerUserId: recruiter.context.user.providerUserId,
          roleType: "recruiter",
          talentIdentityId: recruiter.context.aggregate.talentIdentity.id,
        },
      },
      recruiter,
    };
  }

  it("approves a request from the secure review path and then unlocks recruiter private data", async () => {
    const { candidate, organization, recruiter, recruiterActor } = await seedActors();
    const request = await createAccessRequestRecord({
      justification: "Need final-stage verification review.",
      metadataJson: {
        requested_duration_days: 7,
      },
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });
    const token = "review-token-123";

    await createAccessRequestReviewTokenRecord({
      accessRequestId: request.id,
      channel: "email",
      expiresAt: "2099-01-01T00:00:00.000Z",
      tokenHash: hashAccessRequestReviewToken(token),
    });

    const beforeReview = await getAccessRequestReview({
      correlationId: "corr-review",
      requestId: request.id,
      reviewTokenOptional: token,
      sessionActorOptional: null,
    });

    expect(beforeReview.status).toBe("pending");

    const approved = await resolveAccessRequestFromReview({
      action: "grant",
      correlationId: "corr-review-approve",
      requestId: request.id,
      reviewTokenOptional: token,
      sessionActorOptional: null,
    });

    expect(approved.status).toBe("granted");

    const privateProfile = await getRecruiterPrivateCandidateProfile({
      actor: recruiterActor,
      correlationId: "corr-private-profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    expect(privateProfile.access.granted).toBe(true);
    expect(privateProfile.access.grantedExpiresAtOptional).not.toBeNull();
  });

  it("rejects a request from the candidate owner path and keeps recruiter access locked", async () => {
    const { candidate, candidateActor, organization, recruiter, recruiterActor } = await seedActors();
    const request = await createAccessRequestRecord({
      justification: "Need private profile review.",
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    const rejected = await resolveAccessRequestFromReview({
      action: "reject",
      correlationId: "corr-review-reject",
      noteOptional: "Not needed for this stage.",
      requestId: request.id,
      reviewTokenOptional: null,
      sessionActorOptional: candidateActor,
    });

    expect(rejected.status).toBe("rejected");

    await expect(
      getRecruiterPrivateCandidateProfile({
        actor: recruiterActor,
        correlationId: "corr-private-profile-rejected",
        subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
      }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it("audits expired review-token access attempts and blocks SMS preference changes without a phone number", async () => {
    const { candidate, candidateActor, organization, recruiter } = await seedActors();
    const request = await createAccessRequestRecord({
      justification: "Need private profile review.",
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    await createAccessRequestReviewTokenRecord({
      accessRequestId: request.id,
      channel: "email",
      expiresAt: "2000-01-01T00:00:00.000Z",
      tokenHash: hashAccessRequestReviewToken("review-token-123"),
    });

    await expect(
      getAccessRequestReview({
        correlationId: "corr-expired-review",
        requestId: request.id,
        reviewTokenOptional: "review-token-123",
        sessionActorOptional: null,
      }),
    ).rejects.toMatchObject({
      status: 403,
    });

    const denialEvent = listAuditEvents().find(
      (event) => event.event_type === "security.access_request.review.denied",
    );

    expect(denialEvent?.metadata_json).toMatchObject({
      reason: "expired_token",
    });

    await expect(
      updateCandidateNotificationPreferences({
        actor: candidateActor,
        correlationId: "corr-sms-pref",
        input: {
          accessRequestSmsEnabled: true,
        },
        talentIdentityId: candidate.context.aggregate.talentIdentity.id,
      }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});
