import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findPersistentContextByUserId,
  getDatabasePool,
  provisionGoogleUser,
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
    expect(refreshed.user.lastName).toBe("Updated");
    expect(refreshed.user.imageUrl).toBe("https://example.com/avatar.png");
    expect(Number(counts.rows[0]?.users_count ?? 0)).toBe(1);
    expect(Number(counts.rows[0]?.identities_count ?? 0)).toBe(1);
  });
});
