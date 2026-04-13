import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { provisionGoogleUser } from "@/packages/persistence/src";
import {
  createAccessGrantRecord,
  createAccessRequestRecord,
  createOrganizationMembershipRecord,
  createOrganizationRecord,
  ensurePrimaryOrganizationForUser,
  findAccessRequestById,
  findActiveAccessGrant,
  findLatestAccessGrantByRequestId,
  findOrganizationMembership,
  listOrganizationMembershipContextsForUser,
  listOrganizationMembershipsForUser,
  markAccessRequestGranted,
  markAccessRequestRejected,
  revokeAccessGrantRecord,
} from "./access-control-repository";
import { installTestDatabase, resetTestDatabase } from "./test-helpers";

describe("access-control repository", () => {
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

  it("creates organization memberships and lists active memberships by user", async () => {
    const { recruiter } = await seedUsers();
    const organization = await createOrganizationRecord({
      name: "Acme Recruiting",
    });

    await createOrganizationMembershipRecord({
      organizationId: organization.id,
      role: "owner",
      userId: recruiter.context.user.id,
    });

    const membership = await findOrganizationMembership({
      organizationId: organization.id,
      status: "active",
      userId: recruiter.context.user.id,
    });
    const memberships = await listOrganizationMembershipsForUser({
      status: "active",
      userId: recruiter.context.user.id,
    });
    const membershipContexts = await listOrganizationMembershipContextsForUser({
      status: "active",
      userId: recruiter.context.user.id,
    });

    expect(membership).toMatchObject({
      organizationId: organization.id,
      role: "owner",
      status: "active",
      userId: recruiter.context.user.id,
    });
    expect(memberships).toHaveLength(1);
    expect(membershipContexts).toEqual([
      expect.objectContaining({
        membership: expect.objectContaining({
          organizationId: organization.id,
          role: "owner",
        }),
        organization: expect.objectContaining({
          id: organization.id,
          name: "Acme Recruiting",
        }),
      }),
    ]);
  });

  it("creates, grants, and rejects durable access requests", async () => {
    const { candidate, recruiter } = await seedUsers();
    const organization = await createOrganizationRecord({
      name: "Acme Recruiting",
    });

    await createOrganizationMembershipRecord({
      organizationId: organization.id,
      role: "admin",
      userId: recruiter.context.user.id,
    });

    const accessRequest = await createAccessRequestRecord({
      justification: "Need private verification details for an interview loop.",
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    expect(accessRequest.status).toBe("pending");

    const grantedRequest = await markAccessRequestGranted({
      grantedByActorId: candidate.context.aggregate.talentIdentity.id,
      grantedByActorType: "talent_user",
      metadataJson: {
        note: "Approved for the current hiring loop.",
      },
      requestId: accessRequest.id,
    });

    expect(grantedRequest?.status).toBe("granted");
    expect((await findAccessRequestById({ requestId: accessRequest.id }))?.status).toBe("granted");

    const rejectedRequest = await createAccessRequestRecord({
      justification: "Second request for testing rejections.",
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    const rejected = await markAccessRequestRejected({
      metadataJson: {
        note: "Rejected in test.",
      },
      rejectedByActorId: candidate.context.aggregate.talentIdentity.id,
      rejectedByActorType: "talent_user",
      requestId: rejectedRequest.id,
    });

    expect(rejected?.status).toBe("rejected");
  });

  it("creates active access grants and ignores expired ones", async () => {
    const { candidate, recruiter } = await seedUsers();
    const membership = await ensurePrimaryOrganizationForUser({
      organizationName: "Riley Recruiting",
      userId: recruiter.context.user.id,
    });

    const activeGrant = await createAccessGrantRecord({
      grantedByActorId: candidate.context.aggregate.talentIdentity.id,
      grantedByActorType: "talent_user",
      organizationId: membership.organizationId,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    expect(
      await findActiveAccessGrant({
        organizationId: membership.organizationId,
        scope: "candidate_private_profile",
        subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
      }),
    ).toMatchObject({
      id: activeGrant.id,
      organizationId: membership.organizationId,
      status: "active",
    });

    await createAccessGrantRecord({
      expiresAt: "2000-01-01T00:00:00.000Z",
      grantedByActorId: candidate.context.aggregate.talentIdentity.id,
      grantedByActorType: "talent_user",
      organizationId: membership.organizationId,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    expect(
      await findActiveAccessGrant({
        organizationId: membership.organizationId,
        scope: "candidate_private_profile",
        subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
      }),
    ).toMatchObject({
        id: activeGrant.id,
      });
  });

  it("revokes the latest access grant and keeps durable revocation provenance", async () => {
    const { candidate, recruiter } = await seedUsers();
    const membership = await ensurePrimaryOrganizationForUser({
      organizationName: "Riley Recruiting",
      userId: recruiter.context.user.id,
    });
    const request = await createAccessRequestRecord({
      justification: "Need access for final offer review.",
      organizationId: membership.organizationId,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    const activeGrant = await createAccessGrantRecord({
      accessRequestId: request.id,
      grantedByActorId: candidate.context.aggregate.talentIdentity.id,
      grantedByActorType: "talent_user",
      organizationId: membership.organizationId,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    const revokedGrant = await revokeAccessGrantRecord({
      grantId: activeGrant.id,
      metadataJson: {
        revocation_note: "Role is no longer active.",
      },
      revokedByActorId: candidate.context.aggregate.talentIdentity.id,
      revokedByActorType: "talent_user",
    });

    expect(revokedGrant).toMatchObject({
      id: activeGrant.id,
      revokedByActorId: candidate.context.aggregate.talentIdentity.id,
      revokedByActorType: "talent_user",
      status: "revoked",
    });
    expect(
      await findActiveAccessGrant({
        organizationId: membership.organizationId,
        scope: "candidate_private_profile",
        subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
      }),
    ).toBeNull();
    expect(
      await findLatestAccessGrantByRequestId({
        requestId: request.id,
      }),
    ).toMatchObject({
      id: activeGrant.id,
      revokedByActorId: candidate.context.aggregate.talentIdentity.id,
      status: "revoked",
    });
  });
});
