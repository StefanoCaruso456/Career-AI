import { afterEach, describe, expect, it } from "vitest";
import {
  getAuthSecret,
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
  for (const key of trackedKeys) {
    const originalValue = originalEnv[key];

    if (originalValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = originalValue;
  }
});

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

  it("falls back to localhost during development", () => {
    process.env.NODE_ENV = "development";

    expect(getPublicBaseUrl()).toBe("http://localhost:3000");
    expect(getGoogleRedirectUri()).toBe("http://localhost:3000/api/auth/callback/google");
  });
});
