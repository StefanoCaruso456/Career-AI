import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import {
  createTalentIdentity,
  findTalentIdentityByEmail,
  getTalentIdentity,
  getTalentIdentityByEmail,
  updatePrivacySettings,
} from "@/packages/identity-domain/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("identity service", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetAuditStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates a unique talent agent id and soul record during onboarding", async () => {
    const first = await createTalentIdentity({
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

    const second = await createTalentIdentity({
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

  it("prevents duplicate emails", async () => {
    await createTalentIdentity({
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

    await expect(() =>
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
    ).rejects.toThrowError(/already exists/i);
  });

  it("finds a talent identity by normalized email", async () => {
    const created = await createTalentIdentity({
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

    const found = await findTalentIdentityByEmail({
      email: "JANE@example.com",
      correlationId: "corr-2",
    });

    expect(found?.talentIdentity.email).toBe("jane@example.com");
    expect(found?.talentIdentity.id).toBe(created.talentIdentity.id);
    await expect(
      findTalentIdentityByEmail({
        email: "missing@example.com",
        correlationId: "corr-3",
      }),
    ).resolves.toBeNull();
  });

  it("updates privacy settings and writes an audit event", async () => {
    const created = await createTalentIdentity({
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

    const updated = await updatePrivacySettings({
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

    const fetched = await getTalentIdentity({
      talentIdentityId: created.talentIdentity.id,
      correlationId: "corr-3",
    });

    expect(fetched.privacySettings.show_employment_records).toBe(true);
    expect(listAuditEvents().map((event) => event.event_type)).toContain(
      "candidate.privacy_settings.updated",
    );
  });

  it("retrieves an existing identity by normalized email", async () => {
    const created = await createTalentIdentity({
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

    const fetched = await getTalentIdentityByEmail({
      email: "JANE@example.com",
      correlationId: "corr-2",
    });

    expect(fetched.talentIdentity.id).toBe(created.talentIdentity.id);
    expect(fetched.soulRecord.id).toBe(created.soulRecord.id);
  });
});
