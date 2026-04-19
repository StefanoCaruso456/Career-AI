import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAuditStore } from "@/packages/audit-security/src";
import { createCredentialUser } from "@/lib/credential-user-store";
import { getDatabasePool } from "@/packages/persistence/src";
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
        authProvider: "google",
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
        authProvider: "google",
        email: "taylor.morgan@example.com",
        name: "Taylor Morgan",
        providerUserId: "google-user-1",
      },
      correlationId: "corr-1",
    });

    const second = await ensureTalentIdentityForSessionUser({
      user: {
        authProvider: "google",
        email: "TAYLOR.MORGAN@example.com",
        name: "Taylor Morgan",
        providerUserId: "google-user-1",
      },
      correlationId: "corr-2",
    });

    expect(second.talentIdentity.id).toBe(first.talentIdentity.id);
    expect(second.talentIdentity.talent_agent_id).toBe(first.talentIdentity.talent_agent_id);
  });

  it("reuses the existing credential-backed identity without provisioning a Google user", async () => {
    const createdUser = await createCredentialUser({
      email: "returning.credential@example.com",
      name: "Returning Credential",
      password: "supersecret1",
    });

    const aggregate = await ensureTalentIdentityForSessionUser({
      user: {
        authProvider: "credentials",
        email: "returning.credential@example.com",
        name: "Returning Credential",
        providerUserId: createdUser.providerUserId,
      },
      correlationId: "corr-credentials-1",
    });

    const pool = getDatabasePool();
    const counts = await pool.query<{
      credentials_count: string;
      users_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM users) AS users_count,
        (SELECT COUNT(*)::text FROM user_credentials) AS credentials_count
    `);

    expect(aggregate.talentIdentity.email).toBe("returning.credential@example.com");
    expect(Number(counts.rows[0]?.users_count ?? 0)).toBe(1);
    expect(Number(counts.rows[0]?.credentials_count ?? 0)).toBe(1);
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
    ).toThrowError(/authenticated email/i);
  });
});
