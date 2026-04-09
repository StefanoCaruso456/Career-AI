import { beforeEach, describe, expect, it } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { resetIdentityStore } from "@/packages/identity-domain/src";
import { ensureTalentIdentityForSessionUser, requireSessionEmail } from "@/auth-identity";

describe("auth identity provisioning", () => {
  beforeEach(() => {
    resetIdentityStore();
    resetAuditStore();
  });

  it("creates a Career AI identity from a verified Google session user", () => {
    const aggregate = ensureTalentIdentityForSessionUser({
      user: {
        email: "taylor.morgan@example.com",
        name: "Taylor Morgan",
      },
      correlationId: "corr-1",
    });

    expect(aggregate.talentIdentity.email).toBe("taylor.morgan@example.com");
    expect(aggregate.talentIdentity.first_name).toBe("Taylor");
    expect(aggregate.talentIdentity.last_name).toBe("Morgan");
    expect(aggregate.talentIdentity.country_code).toBe("ZZ");
    expect(aggregate.soulRecord.talent_identity_id).toBe(aggregate.talentIdentity.id);
  });

  it("reuses the same identity on subsequent sign-ins for the same email", () => {
    const first = ensureTalentIdentityForSessionUser({
      user: {
        email: "taylor.morgan@example.com",
        name: "Taylor Morgan",
      },
      correlationId: "corr-1",
    });

    const second = ensureTalentIdentityForSessionUser({
      user: {
        email: "TAYLOR.MORGAN@example.com",
        name: "Taylor Morgan",
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
