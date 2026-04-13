import { describe, expect, it } from "vitest";
import {
  createInternalServiceActorIdentity,
  getAuditActorTypeForActorIdentity,
  getRequestActorIdForActorIdentity,
  resolveActorIdentity,
  resolveAuthenticatedActorIdentity,
} from "@/actor-identity";

describe("actor identity helpers", () => {
  it("resolves an authenticated session user into a stable actor identity", () => {
    const identity = resolveAuthenticatedActorIdentity({
      appUserId: "user_123",
      authProvider: "google",
      email: "Taylor.Morgan@example.com",
      name: "Taylor Morgan",
      preferredPersona: "employer",
      providerUserId: "google-123",
      roleType: "recruiter",
      talentIdentityId: "tal_456",
    });

    expect(identity).toEqual({
      appUserId: "user_123",
      authProvider: "google",
      authSource: "nextauth_session",
      email: "taylor.morgan@example.com",
      id: "user:tal_456",
      kind: "authenticated_user",
      name: "Taylor Morgan",
      preferredPersona: "employer",
      providerUserId: "google-123",
      roleType: "recruiter",
      talentIdentityId: "tal_456",
    });
  });

  it("resolves a guest chat owner into a guest actor identity", () => {
    const identity = resolveActorIdentity({
      guestOwnerId: "guest:abc123",
    });

    expect(identity).toEqual({
      authSource: "chat_owner_cookie",
      guestSessionId: "abc123",
      id: "guest:abc123",
      kind: "guest_user",
      preferredPersona: null,
      roleType: null,
    });
  });

  it("creates a future-safe internal service actor identity", () => {
    expect(
      createInternalServiceActorIdentity({
        roleType: "reviewer_admin",
        serviceActorId: "verifier-runtime",
        serviceName: "verifier",
      }),
    ).toEqual({
      authSource: "internal_service",
      id: "service:verifier-runtime",
      kind: "internal_service",
      preferredPersona: null,
      roleType: "reviewer_admin",
      serviceActorId: "verifier-runtime",
      serviceName: "verifier",
    });
  });

  it("maps reviewer admins and request actor ids for verified route auth", () => {
    const identity = resolveAuthenticatedActorIdentity({
      appUserId: "user_123",
      email: "reviewer@example.com",
      roleType: "reviewer_admin",
      talentIdentityId: "tal_789",
    });

    expect(identity).not.toBeNull();
    expect(getAuditActorTypeForActorIdentity(identity!)).toBe("reviewer_admin");
    expect(getRequestActorIdForActorIdentity(identity!)).toBe("tal_789");
  });
});
