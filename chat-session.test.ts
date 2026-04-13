import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/auth-config", () => ({
  getAuthSecret: () => "test-chat-session-secret",
}));

import { resolveChatActor } from "@/chat-session";

describe("chat session owner resolution", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
  });

  it("reuses the same guest owner when the cookie value is percent-encoded", async () => {
    const initialActor = await resolveChatActor(null);
    const encodedCookieValue = encodeURIComponent(initialActor.cookieValue ?? "");
    const reusedActor = await resolveChatActor(encodedCookieValue);

    expect(initialActor.ownerId.startsWith("guest:")).toBe(true);
    expect(initialActor.identity.kind).toBe("guest_user");
    expect(reusedActor.ownerId).toBe(initialActor.ownerId);
    expect(reusedActor.cookieValue).toBeUndefined();
  });

  it("resolves authenticated chat users through the shared actor identity", async () => {
    authMock.mockResolvedValue({
      user: {
        appUserId: "user_123",
        email: "person@example.com",
        preferredPersona: "job_seeker",
        roleType: "candidate",
        talentIdentityId: "tal_123",
      },
    });

    const actor = await resolveChatActor(null);

    expect(actor.ownerId).toBe("user:tal_123");
    expect(actor.identity).toMatchObject({
      appUserId: "user_123",
      kind: "authenticated_user",
      preferredPersona: "job_seeker",
      roleType: "candidate",
      talentIdentityId: "tal_123",
    });
  });
});
