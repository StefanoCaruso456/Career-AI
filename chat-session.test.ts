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
    expect(reusedActor.ownerId).toBe(initialActor.ownerId);
    expect(reusedActor.cookieValue).toBeUndefined();
  });
});
