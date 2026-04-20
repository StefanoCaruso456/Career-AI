import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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

vi.mock("@/components/persona-preference-sync", () => ({
  PersonaPreferenceSync: ({ persona }: { persona: string }) => (
    <div data-testid="persona-sync">{persona}</div>
  ),
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ),
}));

describe("AccountLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children directly while the page handles signed-out redirects", async () => {
    mocks.auth.mockResolvedValue(null);

    const Layout = (await import("@/app/account/layout")).default;

    render(await Layout({ children: <div>Access requests</div> }));

    expect(screen.getByText("Access requests")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-shell")).not.toBeInTheDocument();
    expect(mocks.ensurePersistentCareerIdentityForSessionUser).not.toHaveBeenCalled();
  });

  it("keeps the workspace shell for signed-in candidates without forcing onboarding", async () => {
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

    const Layout = (await import("@/app/account/layout")).default;

    render(await Layout({ children: <div>Access requests</div> }));

    expect(screen.getByTestId("workspace-shell")).toBeInTheDocument();
    expect(screen.getByText("Access requests")).toBeInTheDocument();
  });

  it("redirects completed recruiter roles into the employer workspace", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_456",
        authProvider: "google",
        email: "recruiter@example.com",
        image: null,
        name: "Riley Recruiter",
        providerUserId: "google_456",
      },
    });
    mocks.ensurePersistentCareerIdentityForSessionUser.mockResolvedValue({
      context: {
        onboarding: {
          roleType: "recruiter",
          status: "completed",
        },
      },
    });

    const Layout = (await import("@/app/account/layout")).default;

    await Layout({ children: <div>Access requests</div> });

    expect(mocks.redirect).toHaveBeenCalledWith("/employer");
  });
});
