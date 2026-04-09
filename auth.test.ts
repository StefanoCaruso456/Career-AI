import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuthSecret,
  getGoogleAuthDisabledMessage,
  getGoogleAuthStatus,
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
  getPublicBaseUrl,
} from "@/auth-config";

const trackedKeys = [
  "AUTH_SECRET",
  "AUTH_URL",
  "CLIENT_ID",
  "CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_ID",
  "GOOGLE_SECRET",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "NODE_ENV",
  "RAILWAY_PUBLIC_DOMAIN",
] as const;

const originalEnv = Object.fromEntries(trackedKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.resetModules();

  for (const key of trackedKeys) {
    const originalValue = originalEnv[key];

    if (originalValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = originalValue;
  }
});

async function loadAuthModule() {
  vi.resetModules();
  return import("@/auth");
}

describe("auth config helpers", () => {
  it("accepts standard Auth.js aliases for Google credentials", () => {
    process.env.GOOGLE_ID = "google-id";
    process.env.GOOGLE_SECRET = "google-secret";

    expect(getGoogleClientId()).toBe("google-id");
    expect(getGoogleClientSecret()).toBe("google-secret");
  });

  it("prefers explicit project Google env vars when both are present", () => {
    process.env.GOOGLE_ID = "google-id";
    process.env.GOOGLE_SECRET = "google-secret";
    process.env.GOOGLE_CLIENT_ID = "project-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "project-client-secret";

    expect(getGoogleClientId()).toBe("project-client-id");
    expect(getGoogleClientSecret()).toBe("project-client-secret");
  });

  it("accepts modern Auth.js URL and secret aliases", () => {
    process.env.AUTH_URL = "https://career-ai.example.com";
    process.env.AUTH_SECRET = "super-secret";

    expect(getPublicBaseUrl()).toBe("https://career-ai.example.com");
    expect(getAuthSecret()).toBe("super-secret");
    expect(getGoogleRedirectUri()).toBe("https://career-ai.example.com/api/auth/callback/google");
  });

  it("derives the Railway public URL when NEXTAUTH_URL is unset", () => {
    process.env.NODE_ENV = "production";
    process.env.RAILWAY_PUBLIC_DOMAIN = "career-ai.up.railway.app";

    expect(getPublicBaseUrl()).toBe("https://career-ai.up.railway.app");
    expect(getGoogleRedirectUri()).toBe("https://career-ai.up.railway.app/api/auth/callback/google");
  });

  it("does not guess a localhost callback when the app URL is unset", () => {
    process.env.NODE_ENV = "development";

    expect(getPublicBaseUrl()).toBe("");
    expect(getGoogleRedirectUri()).toBe("");
  });

  it("explains exactly which Google auth requirements are missing", () => {
    process.env.GOOGLE_CLIENT_ID = "project-client-id";
    process.env.AUTH_URL = "https://career-ai.example.com";

    expect(getGoogleAuthDisabledMessage()).toBe(
      "Google sign-in is disabled until GOOGLE_CLIENT_SECRET or GOOGLE_SECRET and NEXTAUTH_SECRET or AUTH_SECRET are configured.",
    );
  });

  it("returns a live Google auth status payload for the UI", () => {
    process.env.GOOGLE_CLIENT_ID = "project-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "project-client-secret";
    process.env.RAILWAY_PUBLIC_DOMAIN = "career-ai.up.railway.app";

    expect(getGoogleAuthStatus()).toEqual({
      disabledMessage:
        "Google sign-in is disabled until NEXTAUTH_SECRET or AUTH_SECRET is configured.",
      enabled: false,
      missingRequirements: ["NEXTAUTH_SECRET or AUTH_SECRET"],
      redirectUri: "https://career-ai.up.railway.app/api/auth/callback/google",
    });
  });
});

describe("auth module readiness", () => {
  it("disables Google OAuth when required config is missing", async () => {
    const authModule = await loadAuthModule();

    expect(authModule.googleOAuthEnabled).toBe(false);
    expect(authModule.googleOAuthMissingRequirements).toEqual([
      "GOOGLE_CLIENT_ID or GOOGLE_ID",
      "GOOGLE_CLIENT_SECRET or GOOGLE_SECRET",
      "NEXTAUTH_URL, AUTH_URL, or RAILWAY_PUBLIC_DOMAIN",
      "NEXTAUTH_SECRET or AUTH_SECRET",
    ]);
  });

  it("enables Google OAuth when all required config is present", async () => {
    process.env.GOOGLE_CLIENT_ID = "project-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "project-client-secret";
    process.env.AUTH_URL = "https://career-ai.example.com";
    process.env.AUTH_SECRET = "super-secret";

    const authModule = await loadAuthModule();

    expect(authModule.googleOAuthEnabled).toBe(true);
    expect(authModule.googleOAuthMissingRequirements).toEqual([]);
    expect(authModule.googleOAuthDisabledMessage).toBe("");
    expect(authModule.googleRedirectUri).toBe(
      "https://career-ai.example.com/api/auth/callback/google",
    );
  });
});
