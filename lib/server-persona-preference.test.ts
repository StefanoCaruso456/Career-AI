import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cookies: vi.fn(),
  getPersistentCareerIdentityForSessionUser: vi.fn(),
  isDatabaseConfigured: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/auth-identity", () => ({
  getPersistentCareerIdentityForSessionUser: mocks.getPersistentCareerIdentityForSessionUser,
}));

vi.mock("@/packages/persistence/src", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

import { getServerPreferredPersona } from "@/lib/server-persona-preference";

describe("server persona preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PERSIST_SERVER_PERSONA_PREFERENCE;
    mocks.cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "job_seeker" }),
      getAll: vi.fn().mockReturnValue([{ name: "career-ai-preferred-persona", value: "job_seeker" }]),
    });
    mocks.auth.mockResolvedValue(null);
    mocks.isDatabaseConfigured.mockReturnValue(false);
  });

  it("falls back to the cookie preference when no authenticated user is present", async () => {
    await expect(getServerPreferredPersona()).resolves.toBe("job_seeker");
  });

  it("prefers the persisted persona for authenticated users when available", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_123",
        authProvider: "google",
        email: "taylor@example.com",
        image: null,
        name: "Taylor",
        providerUserId: "google-123",
      },
    });
    mocks.getPersistentCareerIdentityForSessionUser.mockResolvedValue({
      aggregate: {},
      onboarding: {},
      user: {
        preferredPersona: "employer",
      },
    });

    await expect(getServerPreferredPersona()).resolves.toBe("employer");
  });
});
