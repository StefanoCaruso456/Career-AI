import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getClaimAuditTrail,
  listAccessControlOverview,
  listPendingReviewQueue,
  submitReviewDecision,
} from "@/packages/admin-ops/src";
import { addProvenanceRecord, resetVerificationStore } from "@/packages/verification-domain/src";
import { resetAuditStore } from "@/packages/audit-security/src";
import { resetArtifactStore } from "@/packages/artifact-domain/src";
import { createEmploymentClaim, resetCredentialStore } from "@/packages/credential-domain/src";
import { createTalentIdentity } from "@/packages/identity-domain/src";
import {
  createAccessGrantRecord,
  createAccessRequestRecord,
  createOrganizationMembershipRecord,
  createOrganizationRecord,
  provisionGoogleUser,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("admin operations service", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetCredentialStore();
    resetVerificationStore();
    resetArtifactStore();
    resetAuditStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("lists pending review items and resolves them through reviewer decisions", async () => {
    const aggregate = await createTalentIdentity({
      input: {
        email: "review@example.com",
        firstName: "Review",
        lastName: "Candidate",
        countryCode: "US",
      },
      actorType: "talent_user",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const created = await createEmploymentClaim({
      input: {
        soulRecordId: aggregate.soulRecord.id,
        employerName: "Signal Labs",
        roleTitle: "Research Ops",
        startDate: "2023-02-01",
        currentlyEmployed: false,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-2",
    });

    const queue = await listPendingReviewQueue({
      correlationId: "corr-3",
    });

    expect(queue).toHaveLength(1);
    expect(queue[0]?.verificationRecordId).toBe(created.verificationRecord.id);

    await submitReviewDecision({
      input: {
        verificationRecordId: created.verificationRecord.id,
        targetStatus: "REVIEWED",
        reason: "Evidence reviewed",
        reviewerActorId: "admin_1",
      },
      actorType: "reviewer_admin",
      actorId: "admin_1",
      correlationId: "corr-4",
    });

    expect(
      await listPendingReviewQueue({
        correlationId: "corr-5",
      }),
    ).toHaveLength(0);
  });

  it("builds an audit trail with provenance and related audit events", async () => {
    const aggregate = await createTalentIdentity({
      input: {
        email: "audit@example.com",
        firstName: "Audit",
        lastName: "Trail",
        countryCode: "US",
      },
      actorType: "talent_user",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const created = await createEmploymentClaim({
      input: {
        soulRecordId: aggregate.soulRecord.id,
        employerName: "Atlas Works",
        roleTitle: "Program Manager",
        startDate: "2021-07-10",
        currentlyEmployed: true,
      },
      actorType: "talent_user",
      actorId: aggregate.talentIdentity.id,
      correlationId: "corr-2",
    });

    await addProvenanceRecord({
      verificationRecordId: created.verificationRecord.id,
      input: {
        sourceActorType: "reviewer_admin",
        sourceActorIdOptional: "admin_7",
        sourceMethod: "INTERNAL_REVIEW",
        sourceDetails: {
          note: "Offer letter metadata matched.",
        },
      },
      actorType: "reviewer_admin",
      actorId: "admin_7",
      correlationId: "corr-3",
    });

    const trail = await getClaimAuditTrail({
      claimId: created.claim.id,
      correlationId: "corr-4",
    });

    expect(trail.candidate.displayName).toBe("Audit Trail");
    expect(trail.provenance).toHaveLength(1);
    expect(trail.auditEvents.some((event) => event.eventType === "claim.created")).toBe(true);
  });

  it("surfaces request and grant lifecycle visibility for internal trust operations", async () => {
    const recruiter = await provisionGoogleUser({
      correlationId: "corr-admin-recruiter",
      email: "recruiter-admin@example.com",
      emailVerified: true,
      firstName: "Riley",
      fullName: "Riley Recruiter",
      lastName: "Recruiter",
      providerUserId: "provider-admin-recruiter",
    });
    const candidate = await provisionGoogleUser({
      correlationId: "corr-admin-candidate",
      email: "candidate-admin@example.com",
      emailVerified: true,
      firstName: "Casey",
      fullName: "Casey Candidate",
      lastName: "Candidate",
      providerUserId: "provider-admin-candidate",
    });
    const organization = await createOrganizationRecord({
      name: "Northstar Hiring",
    });

    await createOrganizationMembershipRecord({
      organizationId: organization.id,
      role: "admin",
      userId: recruiter.context.user.id,
    });

    const request = await createAccessRequestRecord({
      justification: "Need private hiring review access.",
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    await createAccessGrantRecord({
      accessRequestId: request.id,
      grantedByActorId: candidate.context.aggregate.talentIdentity.id,
      grantedByActorType: "talent_user",
      organizationId: organization.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    const overview = await listAccessControlOverview({
      correlationId: "corr-admin-access-overview",
    });

    expect(overview.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organizationName: "Northstar Hiring",
          requestId: request.id,
        }),
      ]),
    );
    expect(overview.activeGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grantLifecycleStatusOptional: "active",
          requestId: request.id,
        }),
      ]),
    );
  });
});
