import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ensurePersistentCareerIdentityForSessionUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/auth-identity", () => ({
  ensurePersistentCareerIdentityForSessionUser: mocks.ensurePersistentCareerIdentityForSessionUser,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

describe("GatedAccountLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets signed-out pages handle their own callback-aware redirects", async () => {
    mocks.auth.mockResolvedValue(null);

    const Layout = (await import("@/app/account/(gated)/layout")).default;

    render(await Layout({ children: <div>Overview</div> }));

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.ensurePersistentCareerIdentityForSessionUser).not.toHaveBeenCalled();
  });

  it("redirects incomplete onboarding back to onboarding for gated pages", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_123",
        authProvider: "google",
        email: "casey@example.com",
        image: null,
        name: "Casey Candidate",
        providerUserId: "google_123",
      },
    });
    mocks.ensurePersistentCareerIdentityForSessionUser.mockResolvedValue({
      context: {
        onboarding: {
          status: "in_progress",
        },
      },
    });

    const Layout = (await import("@/app/account/(gated)/layout")).default;

    await Layout({ children: <div>Overview</div> });

    expect(mocks.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("renders completed onboarding pages normally", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_123",
        authProvider: "google",
        email: "casey@example.com",
        image: null,
        name: "Casey Candidate",
        providerUserId: "google_123",
      },
    });
    mocks.ensurePersistentCareerIdentityForSessionUser.mockResolvedValue({
      context: {
        onboarding: {
          status: "completed",
        },
      },
    });

    const Layout = (await import("@/app/account/(gated)/layout")).default;

    render(await Layout({ children: <div>Overview</div> }));

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
