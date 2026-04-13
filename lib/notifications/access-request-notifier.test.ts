import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverAccessRequestCreatedNotifications } from "./access-request-notifier";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import {
  createAccessRequestRecord,
  createOrganizationMembershipRecord,
  createOrganizationRecord,
  provisionGoogleUser,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("deliverAccessRequestCreatedNotifications", () => {
  beforeEach(async () => {
    process.env.ACCESS_REQUEST_NOTIFICATIONS_ENABLED = "true";
    process.env.NEXTAUTH_URL = "https://career-ai.example";
    await resetTestDatabase();
    await installTestDatabase();
    resetAuditStore();
  });

  afterEach(async () => {
    delete process.env.ACCESS_REQUEST_NOTIFICATIONS_ENABLED;
    delete process.env.NEXTAUTH_URL;
    await resetTestDatabase();
    resetAuditStore();
    vi.restoreAllMocks();
  });

  it("writes durable notification audit events and skips SMS when phone alerts are disabled", async () => {
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

    const request = await createAccessRequestRecord({
      justification: "Need final-stage verification review.",
      organizationId: organization.id,
      requesterUserId: recruiter.context.user.id,
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    await deliverAccessRequestCreatedNotifications({
      actor: {
        actorId: recruiter.context.aggregate.talentIdentity.id,
        actorType: "recruiter_user",
        authMethod: "session",
        identity: {
          appUserId: recruiter.context.user.id,
          authProvider: recruiter.context.user.authProvider,
          authSource: "nextauth_session",
          email: recruiter.context.user.email,
          id: `user:${recruiter.context.aggregate.talentIdentity.id}`,
          kind: "authenticated_user",
          name: recruiter.context.user.fullName,
          preferredPersona: "employer",
          providerUserId: recruiter.context.user.providerUserId,
          roleType: "recruiter",
          talentIdentityId: recruiter.context.aggregate.talentIdentity.id,
        },
      },
      correlationId: "corr-notifications",
      requestId: request.id,
    });

    expect(listAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "access.request.notification.sent",
          metadata_json: expect.objectContaining({
            channel: "in_app",
          }),
        }),
        expect.objectContaining({
          event_type: "access.request.notification.skipped",
          metadata_json: expect.objectContaining({
            channel: "email",
            reason: "email_provider_not_configured",
          }),
        }),
        expect.objectContaining({
          event_type: "access.request.notification.skipped",
          metadata_json: expect.objectContaining({
            channel: "sms",
            reason: "sms_alerts_disabled",
          }),
        }),
      ]),
    );
  });
});
