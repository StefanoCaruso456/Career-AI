"use client";

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonaPreferenceSync } from "@/components/persona-preference-sync";
import { preferredPersonaCookieName, preferredPersonaStorageKey } from "@/lib/persona-preference";

const { useSessionMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: useSessionMock,
}));

describe("PersonaPreferenceSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.cookie = `${preferredPersonaCookieName}=; Max-Age=0; Path=/`;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ persisted: true, persona: "employer" }), {
        status: 200,
      }),
    ) as typeof fetch;
  });

  it("keeps the existing local storage and cookie preference behavior", async () => {
    useSessionMock.mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    render(<PersonaPreferenceSync persona="employer" />);

    await waitFor(() => {
      expect(window.localStorage.getItem(preferredPersonaStorageKey)).toBe("employer");
      expect(document.cookie).toContain(`${preferredPersonaCookieName}=employer`);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("syncs the preferred persona to the server for authenticated users", async () => {
    useSessionMock.mockReturnValue({
      data: {
        user: {
          appUserId: "user_123",
        },
      },
      status: "authenticated",
    });

    render(<PersonaPreferenceSync persona="employer" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/preferences/persona",
        expect.objectContaining({
          body: JSON.stringify({ persona: "employer" }),
          method: "POST",
        }),
      );
    });
  });
});
