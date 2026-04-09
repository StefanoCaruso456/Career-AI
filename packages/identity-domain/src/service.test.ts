import { beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import {
  createTalentIdentity,
  getTalentIdentity,
  getTalentIdentityByEmail,
  resetIdentityStore,
  updatePrivacySettings,
} from "@/packages/identity-domain/src";

describe("identity service", () => {
  beforeEach(() => {
    resetIdentityStore();
    resetAuditStore();
  });

  it("creates a unique talent agent id and soul record during onboarding", () => {
    const first = createTalentIdentity({
      input: {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        countryCode: "us",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const second = createTalentIdentity({
      input: {
        email: "john@example.com",
        firstName: "John",
        lastName: "Smith",
        countryCode: "us",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-2",
    });

    expect(first.talentIdentity.talent_agent_id).toBe("TAID-000001");
    expect(second.talentIdentity.talent_agent_id).toBe("TAID-000002");
    expect(first.soulRecord.talent_identity_id).toBe(first.talentIdentity.id);
    expect(first.privacySettings.talent_identity_id).toBe(first.talentIdentity.id);
  });

  it("prevents duplicate emails", () => {
    createTalentIdentity({
      input: {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    expect(() =>
      createTalentIdentity({
        input: {
          email: "JANE@example.com",
          firstName: "Jane",
          lastName: "Dup",
          countryCode: "US",
        },
        actorType: "system_service",
        actorId: "seed",
        correlationId: "corr-2",
      }),
    ).toThrowError(/already exists/i);
  });

  it("updates privacy settings and writes an audit event", () => {
    const created = createTalentIdentity({
      input: {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        countryCode: "US",
      },
      actorType: "talent_user",
      actorId: "talent-seed",
      correlationId: "corr-1",
    });

    const updated = updatePrivacySettings({
      talentIdentityId: created.talentIdentity.id,
      input: {
        showEmploymentRecords: true,
        allowPublicShareLink: true,
      },
      actorType: "talent_user",
      actorId: created.talentIdentity.id,
      correlationId: "corr-2",
    });

    expect(updated.privacySettings.show_employment_records).toBe(true);
    expect(updated.privacySettings.allow_public_share_link).toBe(true);

    const fetched = getTalentIdentity({
      talentIdentityId: created.talentIdentity.id,
      correlationId: "corr-3",
    });

    expect(fetched.privacySettings.show_employment_records).toBe(true);
    expect(listAuditEvents().map((event) => event.event_type)).toContain(
      "candidate.privacy_settings.updated",
    );
  });

  it("retrieves an existing identity by normalized email", () => {
    const created = createTalentIdentity({
      input: {
        email: "jane@example.com",
        firstName: "Jane",
        lastName: "Doe",
        countryCode: "US",
      },
      actorType: "system_service",
      actorId: "seed",
      correlationId: "corr-1",
    });

    const fetched = getTalentIdentityByEmail({
      email: "JANE@example.com",
      correlationId: "corr-2",
    });

    expect(fetched.talentIdentity.id).toBe(created.talentIdentity.id);
    expect(fetched.soulRecord.id).toBe(created.soulRecord.id);
  });
});
