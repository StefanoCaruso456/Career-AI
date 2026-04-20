import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
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
  });

  it("keeps the workspace shell for signed-in candidates without forcing onboarding", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        email: "casey@example.com",
        onboardingStatus: "in_progress",
        roleType: "candidate",
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
        email: "recruiter@example.com",
        onboardingStatus: "completed",
        roleType: "recruiter",
      },
    });

    const Layout = (await import("@/app/account/layout")).default;

    await Layout({ children: <div>Access requests</div> });

    expect(mocks.redirect).toHaveBeenCalledWith("/employer/candidates");
  });
});
