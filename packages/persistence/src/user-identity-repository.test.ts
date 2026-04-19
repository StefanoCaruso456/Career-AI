import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPersistentCredentialUser,
  findPersistentCredentialUserByEmail,
  findPersistentContextByUserId,
  getDatabasePool,
  provisionGoogleUser,
  updatePersistentApplicationProfile,
  updatePersistentTalentIdentityProfile,
  updatePreferredPersona,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("persistent user identity repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates a persistent user and linked identity on first Google sign-in", async () => {
    const provisioned = await provisionGoogleUser({
      email: "new.user@example.com",
      fullName: "New User",
      firstName: "New",
      lastName: "User",
      providerUserId: "google-user-42",
      emailVerified: true,
      correlationId: "corr-1",
    });

    const pool = getDatabasePool();
    const counts = await pool.query<{
      users_count: string;
      identities_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM users) AS users_count,
        (SELECT COUNT(*)::text FROM career_identities) AS identities_count
    `);

    expect(provisioned.createdUser).toBe(true);
    expect(provisioned.createdIdentity).toBe(true);
    expect(provisioned.context.user.email).toBe("new.user@example.com");
    expect(provisioned.context.onboarding.status).toBe("not_started");
    expect(Number(counts.rows[0]?.users_count ?? 0)).toBe(1);
    expect(Number(counts.rows[0]?.identities_count ?? 0)).toBe(1);
  });

  it("updates the existing user without creating duplicates on return login", async () => {
    const first = await provisionGoogleUser({
      email: "returning.user@example.com",
      fullName: "Returning User",
      firstName: "Returning",
      lastName: "User",
      providerUserId: "google-user-99",
      emailVerified: true,
      correlationId: "corr-1",
    });

    const second = await provisionGoogleUser({
      email: "RETURNING.USER@example.com",
      fullName: "Returning User Updated",
      firstName: "Returning",
      lastName: "Updated",
      imageUrl: "https://example.com/avatar.png",
      providerUserId: "google-user-99",
      emailVerified: true,
      correlationId: "corr-2",
    });

    const pool = getDatabasePool();
    const counts = await pool.query<{
      users_count: string;
      identities_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM users) AS users_count,
        (SELECT COUNT(*)::text FROM career_identities) AS identities_count
    `);
    const refreshed = await findPersistentContextByUserId({
      userId: first.context.user.id,
      correlationId: "corr-3",
    });

    expect(second.createdUser).toBe(false);
    expect(second.createdIdentity).toBe(false);
    expect(second.context.user.id).toBe(first.context.user.id);
    expect(refreshed.user.lastName).toBe("User");
    expect(refreshed.user.imageUrl).toBe("https://example.com/avatar.png");
    expect(Number(counts.rows[0]?.users_count ?? 0)).toBe(1);
    expect(Number(counts.rows[0]?.identities_count ?? 0)).toBe(1);
  });

  it("creates a credential-backed user and linked identity", async () => {
    const user = await createPersistentCredentialUser({
      email: "credential.user@example.com",
      fullName: "Credential User",
      firstName: "Credential",
      lastName: "User",
      passwordHash: "hash-123",
      passwordSalt: "salt-123",
      correlationId: "corr-credentials-1",
    });

    const pool = getDatabasePool();
    const counts = await pool.query<{
      users_count: string;
      identities_count: string;
      credentials_count: string;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM users) AS users_count,
        (SELECT COUNT(*)::text FROM career_identities) AS identities_count,
        (SELECT COUNT(*)::text FROM user_credentials) AS credentials_count
    `);
    const context = await findPersistentContextByUserId({
      userId: user.id,
      correlationId: "corr-credentials-2",
    });

    expect(user.email).toBe("credential.user@example.com");
    expect(user.authProvider).toBe("credentials");
    expect(user.providerUserId).toBe("credentials:credential.user@example.com");
    expect(user.passwordHash).toBe("hash-123");
    expect(context.aggregate.talentIdentity.display_name).toBe("Credential User");
    expect(Number(counts.rows[0]?.users_count ?? 0)).toBe(1);
    expect(Number(counts.rows[0]?.identities_count ?? 0)).toBe(1);
    expect(Number(counts.rows[0]?.credentials_count ?? 0)).toBe(1);
  });

  it("looks up credential-backed users by email", async () => {
    await createPersistentCredentialUser({
      email: "lookup.user@example.com",
      fullName: "Lookup User",
      firstName: "Lookup",
      lastName: "User",
      passwordHash: "hash-lookup",
      passwordSalt: "salt-lookup",
      correlationId: "corr-credentials-lookup",
    });

    const user = await findPersistentCredentialUserByEmail({
      email: "LOOKUP.USER@example.com",
    });

    expect(user?.email).toBe("lookup.user@example.com");
    expect(user?.name).toBe("Lookup User");
    expect(user?.passwordHash).toBe("hash-lookup");
  });

  it("rejects password sign-up when the email already belongs to a Google account", async () => {
    await provisionGoogleUser({
      email: "existing.google@example.com",
      fullName: "Existing Google",
      firstName: "Existing",
      lastName: "Google",
      providerUserId: "google-existing-user",
      emailVerified: true,
      correlationId: "corr-google-1",
    });

    await expect(
      createPersistentCredentialUser({
        email: "existing.google@example.com",
        fullName: "Existing Google",
        firstName: "Existing",
        lastName: "Google",
        passwordHash: "hash-google",
        passwordSalt: "salt-google",
        correlationId: "corr-google-2",
      }),
    ).rejects.toThrowError(/linked to Google/i);
  });

  it("updates editable profile fields without touching immutable account metadata", async () => {
    const provisioned = await provisionGoogleUser({
      email: "candidate@example.com",
      fullName: "Casey Lane",
      firstName: "Casey",
      lastName: "Lane",
      providerUserId: "google-user-108",
      emailVerified: true,
      correlationId: "corr-1",
    });

    const updated = await updatePersistentTalentIdentityProfile({
      talentIdentityId: provisioned.context.aggregate.talentIdentity.id,
      input: {
        firstName: "Jordan",
        lastName: "Miles",
        countryCode: "us",
        phoneOptional: "555-0108",
      },
      correlationId: "corr-2",
    });

    const refreshed = await findPersistentContextByUserId({
      userId: provisioned.context.user.id,
      correlationId: "corr-3",
    });

    expect(updated.user.fullName).toBe("Jordan Miles");
    expect(refreshed.user.firstName).toBe("Jordan");
    expect(refreshed.user.lastName).toBe("Miles");
    expect(refreshed.aggregate.talentIdentity.display_name).toBe("Jordan Miles");
    expect(refreshed.aggregate.talentIdentity.country_code).toBe("US");
    expect(refreshed.aggregate.talentIdentity.phone_optional).toBe("555-0108");

    const clearedPhone = await updatePersistentTalentIdentityProfile({
      talentIdentityId: provisioned.context.aggregate.talentIdentity.id,
      input: {
        phoneOptional: null,
      },
      correlationId: "corr-4",
    });

    expect(clearedPhone.aggregate.talentIdentity.phone_optional).toBeNull();
    expect(clearedPhone.user.email).toBe("candidate@example.com");
  });

  it("persists preferred persona separately from onboarding role type", async () => {
    const provisioned = await provisionGoogleUser({
      email: "persona.user@example.com",
      fullName: "Persona User",
      firstName: "Persona",
      lastName: "User",
      providerUserId: "google-user-persona",
      emailVerified: true,
      correlationId: "corr-persona-1",
    });

    const updated = await updatePreferredPersona({
      correlationId: "corr-persona-2",
      preferredPersona: "employer",
      userId: provisioned.context.user.id,
    });

    expect(updated.user.preferredPersona).toBe("employer");
    expect(updated.onboarding.roleType).toBeNull();
  });

  it("stores application profiles independently from onboarding data", async () => {
    const provisioned = await provisionGoogleUser({
      email: "apply.user@example.com",
      fullName: "Apply User",
      firstName: "Apply",
      lastName: "User",
      providerUserId: "google-user-apply",
      emailVerified: true,
      correlationId: "corr-apply-1",
    });

    const updated = await updatePersistentApplicationProfile({
      correlationId: "corr-apply-2",
      profile: {
        email: "apply.user@example.com",
        first_name: "Apply",
        last_name: "User",
      },
      schemaFamily: "greenhouse",
      userId: provisioned.context.user.id,
    });

    expect(updated.applicationProfiles).toMatchObject({
      greenhouse_profile: {
        email: "apply.user@example.com",
        first_name: "Apply",
        last_name: "User",
      },
    });
    expect(updated.onboarding.profile).toEqual({});
  });
});
