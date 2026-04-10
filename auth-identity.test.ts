import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import { ensureTalentIdentityForSessionUser, requireSessionEmail } from "@/auth-identity";

describe("auth identity provisioning", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    resetAuditStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates a Career AI identity from a verified Google session user", async () => {
    const aggregate = await ensureTalentIdentityForSessionUser({
      user: {
        email: "taylor.morgan@example.com",
        name: "Taylor Morgan",
        providerUserId: "google-user-1",
      },
      correlationId: "corr-1",
    });

    expect(aggregate.talentIdentity.email).toBe("taylor.morgan@example.com");
    expect(aggregate.talentIdentity.first_name).toBe("Taylor");
    expect(aggregate.talentIdentity.last_name).toBe("Morgan");
    expect(aggregate.talentIdentity.country_code).toBe("ZZ");
    expect(aggregate.soulRecord.talent_identity_id).toBe(aggregate.talentIdentity.id);
  });

  it("reuses the same identity on subsequent sign-ins for the same email", async () => {
    const first = await ensureTalentIdentityForSessionUser({
      user: {
        email: "taylor.morgan@example.com",
        name: "Taylor Morgan",
        providerUserId: "google-user-1",
      },
      correlationId: "corr-1",
    });

    const second = await ensureTalentIdentityForSessionUser({
      user: {
        email: "TAYLOR.MORGAN@example.com",
        name: "Taylor Morgan",
        providerUserId: "google-user-1",
      },
      correlationId: "corr-2",
    });

    expect(second.talentIdentity.id).toBe(first.talentIdentity.id);
    expect(second.talentIdentity.talent_agent_id).toBe(first.talentIdentity.talent_agent_id);
  });

  it("requires a verified email to provision an identity", () => {
    expect(() =>
      requireSessionEmail(
        {
          email: null,
          name: "Taylor Morgan",
        },
        "corr-1",
      ),
    ).toThrowError(/authenticated Google email/i);
  });
});
