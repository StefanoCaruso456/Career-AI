import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getServerPreferredPersona: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/server-persona-preference", () => ({
  getServerPreferredPersona: mocks.getServerPreferredPersona,
}));

describe("SettingsPage", () => {
  it("redirects signed-in job seekers to the canonical account settings route", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        email: "casey@example.com",
        roleType: "candidate",
      },
    });
    mocks.getServerPreferredPersona.mockResolvedValue("job_seeker");

    const Page = (await import("@/app/settings/page")).default;

    await Page();

    expect(mocks.redirect).toHaveBeenCalledWith("/account/settings");
  });

  it("keeps the sign-in callback pointed at the canonical account settings route", async () => {
    mocks.auth.mockResolvedValue(null);
    mocks.getServerPreferredPersona.mockResolvedValue("job_seeker");

    const Page = (await import("@/app/settings/page")).default;

    await Page();

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/sign-in?callbackUrl=%2Faccount%2Fsettings",
    );
  });
});
