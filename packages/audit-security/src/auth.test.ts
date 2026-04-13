import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/packages/contracts/src";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

import {
  assertAllowedActorTypes,
  assertTalentIdentityAccess,
  createPublicActor,
  listAuditEvents,
  resetAuditStore,
  resolveVerifiedActor,
} from "@/packages/audit-security/src";

describe("auth helpers", () => {
  const originalInternalServiceAuthTokens = process.env.INTERNAL_SERVICE_AUTH_TOKENS;

  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    resetAuditStore();
    delete process.env.INTERNAL_SERVICE_AUTH_TOKENS;
  });

  afterEach(() => {
    if (originalInternalServiceAuthTokens === undefined) {
      delete process.env.INTERNAL_SERVICE_AUTH_TOKENS;
      return;
    }

    process.env.INTERNAL_SERVICE_AUTH_TOKENS = originalInternalServiceAuthTokens;
  });

  it("resolves authenticated session users into verified actors", async () => {
    authMock.mockResolvedValue({
      user: {
        appUserId: "user_123",
        email: "person@example.com",
        roleType: "candidate",
        talentIdentityId: "tal_123",
      },
    });

    const actor = await resolveVerifiedActor(
      new Request("http://localhost/api/v1/talent-identities/tal_123"),
      "corr-1",
    );

    expect(actor).toMatchObject({
      actorId: "tal_123",
      actorType: "talent_user",
      authMethod: "session",
      identity: {
        id: "user:tal_123",
        kind: "authenticated_user",
      },
    });
  });

  it("supports explicit public system actors for public routes", async () => {
    const actor = await resolveVerifiedActor(
      new Request("http://localhost/api/v1/share-profiles/public-token"),
      "corr-1",
      {
        allowPublic: true,
      },
    );

    expect(actor).toEqual({
      actorId: "public_request",
      actorType: "system_service",
      authMethod: "public",
      identity: null,
    });
  });

  it("resolves internal service callers from verified bearer tokens", async () => {
    process.env.INTERNAL_SERVICE_AUTH_TOKENS = "verifier-runtime=secret-token";

    const actor = await resolveVerifiedActor(
      new Request("http://localhost/api/v1/admin/review-queue", {
        headers: {
          authorization: "Bearer secret-token",
        },
      }),
      "corr-1",
    );

    expect(actor).toMatchObject({
      actorId: "verifier-runtime",
      actorType: "system_service",
      authMethod: "internal_service",
      identity: {
        id: "service:verifier-runtime",
        kind: "internal_service",
        serviceName: "verifier-runtime",
      },
    });
  });

  it("writes a durable audit event when verified auth is missing", async () => {
    await expect(
      resolveVerifiedActor(
        new Request("http://localhost/api/v1/admin/review-queue"),
        "corr-missing-auth",
      ),
    ).rejects.toBeInstanceOf(ApiError);

    expect(listAuditEvents()).toContainEqual(
      expect.objectContaining({
        actor_id: "anonymous_request",
        actor_type: "system_service",
        correlation_id: "corr-missing-auth",
        event_type: "security.auth.denied",
        target_id: "/api/v1/admin/review-queue",
        target_type: "route",
      }),
    );
  });

  it("writes a durable audit event when actor type permissions fail", () => {
    expect(() =>
      assertAllowedActorTypes(
        {
          actorId: "tal_123",
          actorType: "talent_user",
          authMethod: "session",
          identity: null,
        },
        ["reviewer_admin"],
        "corr-role-denied",
        "list review queue items",
      ),
    ).toThrow(ApiError);

    expect(listAuditEvents()).toContainEqual(
      expect.objectContaining({
        correlation_id: "corr-role-denied",
        event_type: "security.auth.denied",
        target_id: "list review queue items",
        target_type: "authorization_action",
      }),
    );
  });

  it("writes a durable audit event when talent identity ownership fails", () => {
    expect(() =>
      assertTalentIdentityAccess(
        {
          actorId: "tal_2",
          actorType: "talent_user",
          authMethod: "session",
          identity: null,
        },
        "tal_1",
        "corr-ownership-denied",
      ),
    ).toThrow(ApiError);

    expect(listAuditEvents()).toContainEqual(
      expect.objectContaining({
        correlation_id: "corr-ownership-denied",
        event_type: "security.auth.denied",
        target_id: "tal_1",
        target_type: "talent_identity",
      }),
    );
  });

  it("keeps the public actor helper backward-compatible for explicit public callers", () => {
    expect(createPublicActor()).toEqual({
      actorId: "public_request",
      actorType: "system_service",
      authMethod: "public",
      identity: null,
    });
  });
});
